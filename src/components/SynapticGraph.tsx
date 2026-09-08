import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Sparkles,
  Activity,
  Loader2,
  Tag,
  GitCommit,
  X,
  Calendar,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Search,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Idea } from "../types";
import { performSemanticSearch } from "../lib/semanticSearch";
import { formatIdeaReference } from "../lib/ideaReference";

interface Node {
  id: string;
  idNumber: number;
  shortTitle: string;
  fullText: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  type: string;
  palavrasChave?: string;
  provocacoesFollowUp?: string;
  dataCriacao?: string;
  conexoesId?: string;
}

interface Link {
  source: string;
  target: string;
}

const MAX_LINKS = 1000;

interface SynapticGraphProps {
  ideas?: Idea[];
  loading?: boolean;
  searchQuery?: string;
  onClearSearch?: () => void;
  onOpenSearch?: () => void;
  targetNodeId?: number | null;
}

// Ease-out cubic function for camera transitions
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Helper to extract clean 2-3 words short title from text
function formatShortTitle(text: string, theme?: string): string {
  if (theme && theme.trim().length > 0 && theme.trim().split(/\s+/).length <= 3) {
    return theme.trim();
  }
  const clean = (text || "").replace(/[^\w\sÀ-ÿ]/gi, " ").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Nota";
  if (words.length <= 3) return words.join(" ");
  return words.slice(0, 3).join(" ");
}

export default function SynapticGraph({
  ideas = [],
  loading = false,
  searchQuery = "",
  onClearSearch,
  onOpenSearch,
  targetNodeId = null,
}: SynapticGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeModalButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Interaction states
  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [focusedNode, setFocusedNode] = useState<Node | null>(null);
  const [pendingFocusNode, setPendingFocusNode] = useState<Node | null>(null);
  const [showProvocation, setShowProvocation] = useState<boolean>(false);
  const [zoomPercent, setZoomPercent] = useState<number>(100);

  // Focus timeout ref for 1.5s delay
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Canvas Viewport Transform via Ref for 60fps non-re-rendering physics & camera
  const transformRef = useRef<{ scale: number; pan: { x: number; y: number } }>({
    scale: 1,
    pan: { x: 0, y: 0 },
  });

  // Camera Animation Transition Ref
  const cameraAnimRef = useRef<{
    startTime: number;
    duration: number;
    startScale: number;
    targetScale: number;
    startPan: { x: number; y: number };
    targetPan: { x: number; y: number };
    active: boolean;
  } | null>(null);

  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const nodesRef = useRef<Node[]>([]);
  const nodesByIdRef = useRef<Map<string, Node>>(new Map());
  const [links, setLinks] = useState<Link[]>([]);

  // Calculate matched node IDs based on active search query
  const matchedNodeIds = useMemo<Set<string>>(() => {
    if (!searchQuery || !searchQuery.trim()) {
      return new Set();
    }
    const results = performSemanticSearch(searchQuery, ideas);
    if (results.length > 0) {
      return new Set(results.map((r) => String(r.idea.idNota)));
    }

    return new Set();
  }, [searchQuery, ideas]);

  // Smooth camera zoom animation helper
  const animateCameraTo = useCallback(
    (targetS: number, targetP: { x: number; y: number }, durationMs: number = 750) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        transformRef.current = { scale: targetS, pan: { ...targetP } };
        cameraAnimRef.current = null;
        setZoomPercent(Math.round(targetS * 100));
        return;
      }
      cameraAnimRef.current = {
        startTime: performance.now(),
        duration: durationMs,
        startScale: transformRef.current.scale,
        targetScale: targetS,
        startPan: { ...transformRef.current.pan },
        targetPan: { ...targetP },
        active: true,
      };
      setZoomPercent(Math.round(targetS * 100));
    },
    []
  );

  // Focus and open modal with 1.5s delay after centering camera
  const focusAndOpenNode = useCallback(
    (node: Node, delayMs: number = 1500) => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = null;
      }

      setFocusedNode(null);
      setPendingFocusNode(node);

      const container = containerRef.current;
      const canvasWidth = container?.clientWidth || 900;
      const canvasHeight = container?.clientHeight || 620;
      const targetScale = Math.max(transformRef.current.scale, 1.35);
      const targetPan = {
        x: (canvasWidth / 2 - node.x) * targetScale,
        y: (canvasHeight / 2 - node.y) * targetScale,
      };

      // Smooth 950ms camera glide to center the node
      animateCameraTo(targetScale, targetPan, 950);

      // 1.5s delay before opening the modal
      focusTimeoutRef.current = setTimeout(() => {
        setFocusedNode(node);
        setPendingFocusNode(null);
        focusTimeoutRef.current = null;
      }, delayMs);
    },
    [animateCameraTo]
  );

  const closeFocusedNode = useCallback(() => {
    setFocusedNode(null);
  }, []);

  // Keep keyboard focus inside the modal and restore it after closing.
  useEffect(() => {
    if (!focusedNode) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeModalButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeFocusedNode();
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = Array.from(
          modalRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ) as HTMLElement[];
        if (focusable.length === 0) {
          e.preventDefault();
          modalRef.current.focus();
        } else if (e.shiftKey && document.activeElement === focusable[0]) {
          e.preventDefault();
          focusable[focusable.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
          e.preventDefault();
          focusable[0].focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [focusedNode, closeFocusedNode]);

  // Escape also cancels a pending delayed focus.
  useEffect(() => {
    const cancelPendingFocus = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = null;
        setPendingFocusNode(null);
      }
    };
    document.addEventListener("keydown", cancelPendingFocus);
    return () => document.removeEventListener("keydown", cancelPendingFocus);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  // Reset provocation toggle when focused node changes
  useEffect(() => {
    if (focusedNode) {
      setShowProvocation(false);
    }
  }, [focusedNode]);

  // Initialize nodes and links
  useEffect(() => {
    const containerWidth = containerRef.current?.clientWidth || 900;
    const centerX = containerWidth / 2;
    const centerY = 300;

    const DEFAULT_NODE_COLOR = "#EBAF2D";

    if (ideas.length === 0) {
      nodesRef.current = [];
      nodesByIdRef.current = new Map();
      setLinks([]);
      return;
    }

    const parsedNodes: Node[] = ideas.map((idea, index) => {
      const theme = idea.temaMacro || "GERAL";
      const angle = (index / ideas.length) * Math.PI * 2;
      const radius = 170 + (index % 3) * 60;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      return {
        id: String(idea.idNota),
        idNumber: idea.idNota,
        shortTitle: formatShortTitle(idea.textoBruto, idea.temaMacro),
        fullText: idea.textoBruto,
        x,
        y,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        size: 10 + Math.min(6, idea.textoBruto.length / 80),
        color: DEFAULT_NODE_COLOR,
        type: theme.toUpperCase(),
        palavrasChave: idea.palavrasChave,
        provocacoesFollowUp: idea.provocacoesFollowUp,
        dataCriacao: idea.dataCriacao,
        conexoesId: idea.conexoesId,
      };
    });

    // Build a bounded, deduplicated link index from conexoesId.
    const parsedLinks: Link[] = [];
    const nodeIds = new Set(parsedNodes.map((node) => node.id));
    const linkKeys = new Set<string>();
    parsedNodes.forEach((node) => {
      if (node.conexoesId && parsedLinks.length < MAX_LINKS) {
        const matchedIds = node.conexoesId.match(/\d+/g);
        if (matchedIds) {
          matchedIds.forEach((targetId) => {
            if (parsedLinks.length < MAX_LINKS && targetId !== node.id && nodeIds.has(targetId)) {
              const linkKey = [node.id, targetId].sort().join(":");
              if (!linkKeys.has(linkKey)) {
                linkKeys.add(linkKey);
                parsedLinks.push({ source: node.id, target: targetId });
              }
            }
          });
        }
      }
    });

    nodesRef.current = parsedNodes;
    nodesByIdRef.current = new Map(parsedNodes.map((node) => [node.id, node]));
    setLinks(parsedLinks);
  }, [ideas]);

  // Handle Smart Camera Framing (Bounding Box + Easing) on Search
  const centerHighlightedNodes = useCallback(() => {
    const container = containerRef.current;
    const canvasWidth = container?.clientWidth || 900;
    const canvasHeight = container?.clientHeight || 620;

    if (!nodesRef.current || nodesRef.current.length === 0) return;

    if (matchedNodeIds.size > 0) {
      // Find bounding box across all matched nodes
      const matchedNodes = nodesRef.current.filter((n) => matchedNodeIds.has(n.id));
      if (matchedNodes.length === 1) {
        const single = matchedNodes[0];
        const targetScale = 1.35;
        const targetPan = {
          x: (canvasWidth / 2 - single.x) * targetScale,
          y: (canvasHeight / 2 - single.y) * targetScale,
        };
        animateCameraTo(targetScale, targetPan, 850);
      } else if (matchedNodes.length > 1) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;

        matchedNodes.forEach((n) => {
          const marginX = n.size + 45;
          const marginY = n.size + 35;
          if (n.x - marginX < minX) minX = n.x - marginX;
          if (n.x + marginX > maxX) maxX = n.x + marginX;
          if (n.y - marginY < minY) minY = n.y - marginY;
          if (n.y + marginY > maxY) maxY = n.y + marginY;
        });

        const spanX = Math.max(maxX - minX, 120);
        const spanY = Math.max(maxY - minY, 120);
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Add padding so nodes have comfortable space from canvas edges
        const availWidth = Math.max(canvasWidth - 120, 200);
        const availHeight = Math.max(canvasHeight - 140, 200);

        const scaleX = availWidth / spanX;
        const scaleY = availHeight / spanY;
        const targetScale = Math.min(1.4, Math.max(0.6, Math.min(scaleX, scaleY)));

        const targetPan = {
          x: (canvasWidth / 2 - centerX) * targetScale,
          y: (canvasHeight / 2 - centerY) * targetScale,
        };

        animateCameraTo(targetScale, targetPan, 850);
      }
    } else if (!searchQuery) {
      // Redefine para visão panorâmica geral
      animateCameraTo(1, { x: 0, y: 0 }, 650);
    }
  }, [matchedNodeIds, searchQuery, animateCameraTo]);

  // Handle targetNodeId selection with centering + 1.5s delayed modal
  useEffect(() => {
    if (targetNodeId !== null && nodesRef.current.length > 0) {
      const targetNode = nodesByIdRef.current.get(String(targetNodeId));
      if (targetNode) {
        focusAndOpenNode(targetNode, 1500);
      }
    }
  }, [targetNodeId, focusAndOpenNode]);

  // Trigger camera framing automatically whenever search matches or ideas change
  useEffect(() => {
    const timer = setTimeout(() => {
      centerHighlightedNodes();
    }, 60);
    return () => clearTimeout(timer);
  }, [centerHighlightedNodes, ideas]);

  // Main Canvas Render & Animation Loop (Strictly avoids setState during render loop)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let reducedMotionTimer: ReturnType<typeof setTimeout> | undefined;
    let width = 900;
    let height = 620;
    let dpr = 1;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleResize = () => {
      if (!canvas || !containerRef.current) return;
      width = containerRef.current.clientWidth || 900;
      height = containerRef.current.clientHeight || 620;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    handleResize();
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    const isSearchActive = matchedNodeIds.size > 0;

    const draw = () => {
      if (document.hidden) return;

      // 1. Advance camera animation if active
      if (cameraAnimRef.current && cameraAnimRef.current.active) {
        const anim = cameraAnimRef.current;
        const elapsed = performance.now() - anim.startTime;
        const progress = Math.min(1, elapsed / anim.duration);
        const eased = easeOutCubic(progress);

        transformRef.current.scale = anim.startScale + (anim.targetScale - anim.startScale) * eased;
        transformRef.current.pan.x = anim.startPan.x + (anim.targetPan.x - anim.startPan.x) * eased;
        transformRef.current.pan.y = anim.startPan.y + (anim.targetPan.y - anim.startPan.y) * eased;

        if (progress >= 1) {
          anim.active = false;
        }
      }

      const currentScale = transformRef.current.scale;
      const currentPan = transformRef.current.pan;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      ctx.save();
      // Apply Pan & Zoom Transform around center
      ctx.translate(width / 2 + currentPan.x, height / 2 + currentPan.y);
      ctx.scale(currentScale, currentScale);
      ctx.translate(-width / 2, -height / 2);

      // 2. Draw Connection Lines (Edges)
      links.forEach((link) => {
        const source = nodesByIdRef.current.get(link.source);
        const target = nodesByIdRef.current.get(link.target);

        if (source && target) {
          const isSourceMatched = matchedNodeIds.has(source.id);
          const isTargetMatched = matchedNodeIds.has(target.id);
          const isLinkInSearch = isSearchActive && (isSourceMatched || isTargetMatched);

          const isHighlit =
            hoveredNode?.id === source.id ||
            hoveredNode?.id === target.id ||
            focusedNode?.id === source.id ||
            focusedNode?.id === target.id;

          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);

          if (isHighlit) {
            ctx.strokeStyle = "rgba(235, 175, 45, 0.95)";
            ctx.lineWidth = 2.4 / currentScale;
          } else if (isSearchActive) {
            if (isSourceMatched && isTargetMatched) {
              ctx.strokeStyle = "rgba(235, 175, 45, 0.8)";
              ctx.lineWidth = 2.0 / currentScale;
            } else if (isLinkInSearch) {
              ctx.strokeStyle = "rgba(235, 175, 45, 0.35)";
              ctx.lineWidth = 1.2 / currentScale;
            } else {
              ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
              ctx.lineWidth = 0.8 / currentScale;
            }
          } else {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
            ctx.lineWidth = 1.0 / currentScale;
          }
          ctx.stroke();
        }
      });

      // 3. Physics Simulation (Relaxation)
      if (!reducedMotion.matches) {
        for (let i = 0; i < nodesRef.current.length; i++) {
          const node = nodesRef.current[i];
          for (let j = i + 1; j < nodesRef.current.length; j++) {
            const other = nodesRef.current[j];
            const dx = node.x - other.x;
            const dy = node.y - other.y;
            const dist = Math.hypot(dx, dy) || 1;

            if (dist < 180) {
              const force = (180 - dist) * 0.032;
              node.vx += (dx / dist) * force;
              node.vy += (dy / dist) * force;
              other.vx -= (dx / dist) * force;
              other.vy -= (dy / dist) * force;
            }
          }

          const cx = width / 2;
          const cy = height / 2;
          const dxCenter = cx - node.x;
          const dyCenter = cy - node.y;
          node.vx += dxCenter * 0.0012;
          node.vy += dyCenter * 0.0012;
        }

        links.forEach((link) => {
          const source = nodesByIdRef.current.get(link.source);
          const target = nodesByIdRef.current.get(link.target);
          if (source && target) {
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const dist = Math.hypot(dx, dy) || 1;
            const desiredDist = 135;

            if (dist > desiredDist) {
              const force = (dist - desiredDist) * 0.0012;
              source.vx += (dx / dist) * force;
              source.vy += (dy / dist) * force;
              target.vx -= (dx / dist) * force;
              target.vy -= (dy / dist) * force;
            }
          }
        });
      }

      // 4. Render Nodes with Semantic Highlighting & 15% Fade-out for noise isolation
      const nowMs = performance.now();
      const pulsePhase = Math.sin(nowMs / 220);

      nodesRef.current.forEach((node) => {
        if (!reducedMotion.matches) {
          node.vx *= 0.9;
          node.vy *= 0.9;

          const speed = Math.hypot(node.vx, node.vy);
          const maxSpeed = 1.1;
          if (speed > maxSpeed) {
            node.vx = (node.vx / speed) * maxSpeed;
            node.vy = (node.vy / speed) * maxSpeed;
          }

          node.x += node.vx;
          node.y += node.vy;
        }

        const padding = 50;
        if (node.x < padding) {
          node.x = padding;
          node.vx *= -0.4;
        } else if (node.x > width - padding) {
          node.x = width - padding;
          node.vx *= -0.4;
        }

        if (node.y < padding) {
          node.y = padding;
          node.vy *= -0.4;
        } else if (node.y > height - padding) {
          node.y = height - padding;
          node.vy *= -0.4;
        }

        const isHovered = hoveredNode?.id === node.id;
        const isFocused = focusedNode?.id === node.id;
        const isPending = pendingFocusNode?.id === node.id;
        const isMatched = matchedNodeIds.has(node.id);
        const isSelectedOrActive = isFocused || isPending;

        let nodeOpacity = 1.0;
        if (isSearchActive) {
          nodeOpacity = isMatched ? 1.0 : 0.15; // 15% noise isolation requirement
        }

        ctx.save();
        ctx.globalAlpha = nodeOpacity;

        // Animated Glowing Pulse Ring for Search Matches
        if (isMatched && isSearchActive) {
          const pulseRadius = node.size + 10 + pulsePhase * 4;
          ctx.beginPath();
          ctx.arc(node.x, node.y, pulseRadius, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(235, 175, 45, 0.2)";
          ctx.strokeStyle = "rgba(235, 175, 45, 0.85)";
          ctx.lineWidth = 2.0 / currentScale;
          ctx.fill();
          ctx.stroke();

          // Outer secondary glow
          ctx.beginPath();
          ctx.arc(node.x, node.y, pulseRadius + 6, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(235, 175, 45, 0.3)";
          ctx.lineWidth = 1.0 / currentScale;
          ctx.stroke();
        }

        // Particle Glow Ring on Hover / Focus / Pending
        if (isHovered || isSelectedOrActive) {
          const glowRadius = isPending
            ? node.size + 14 + pulsePhase * 4
            : isFocused
            ? node.size + 10
            : node.size + 7;

          ctx.beginPath();
          ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
          ctx.fillStyle = isFocused
            ? "rgba(223, 82, 65, 0.35)"
            : isPending
            ? "rgba(235, 175, 45, 0.35)"
            : "rgba(235, 175, 45, 0.25)";
          ctx.strokeStyle = isFocused ? "#DF5241" : "#EBAF2D";
          ctx.lineWidth = (isSelectedOrActive ? 2.4 : 1.8) / currentScale;
          ctx.fill();
          ctx.stroke();

          if (isPending || isFocused) {
            // High-contrast outer radar ring for selected node
            ctx.beginPath();
            ctx.arc(node.x, node.y, glowRadius + 8, 0, Math.PI * 2);
            ctx.strokeStyle = isFocused ? "rgba(223, 82, 65, 0.85)" : "rgba(235, 175, 45, 0.85)";
            ctx.lineWidth = 1.4 / currentScale;
            ctx.stroke();
          }
        }

        // Central Node Body (Unified color with highlight if selected)
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size + (isSelectedOrActive ? 2 : 0), 0, Math.PI * 2);
        ctx.fillStyle = isFocused ? "#DF5241" : isHovered ? "#FFC843" : node.color;
        ctx.fill();

        // Inner Core Ring for selected node
        if (isSelectedOrActive || isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size - 3, 0, Math.PI * 2);
          ctx.strokeStyle = "#FFFFFF";
          ctx.lineWidth = 1.2 / currentScale;
          ctx.stroke();
        }

        // Node Title Label
        if (isSearchActive && !isMatched) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
          ctx.font = "500 11px 'DM Sans', sans-serif";
        } else {
          ctx.fillStyle =
            isHovered || isSelectedOrActive || isMatched ? "#FFFFFF" : "rgba(255, 255, 255, 0.85)";
          ctx.font =
            isHovered || isSelectedOrActive || isMatched
              ? "600 12px 'DM Sans', sans-serif"
              : "500 11px 'DM Sans', sans-serif";
        }
        ctx.textAlign = "center";
        ctx.fillText(node.shortTitle, node.x, node.y - node.size - 8);

        ctx.restore();
      });

      ctx.restore();

      if (reducedMotion.matches) {
        reducedMotionTimer = setTimeout(() => {
          animationId = requestAnimationFrame(draw);
        }, 150);
      } else {
        animationId = requestAnimationFrame(draw);
      }
    };

    draw();

    const handleVisibilityChange = () => {
      cancelAnimationFrame(animationId);
      if (reducedMotionTimer) clearTimeout(reducedMotionTimer);
      if (!document.hidden) animationId = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cancelAnimationFrame(animationId);
      if (reducedMotionTimer) clearTimeout(reducedMotionTimer);
    };
  }, [hoveredNode, focusedNode, pendingFocusNode, matchedNodeIds, links]);

  // Transform screen mouse coordinates to World (graph) space
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: screenX, y: screenY };
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const { scale, pan } = transformRef.current;

    const translatedX = screenX - (width / 2 + pan.x);
    const translatedY = screenY - (height / 2 + pan.y);
    const worldX = translatedX / scale + width / 2;
    const worldY = translatedY / scale + height / 2;

    return { x: worldX, y: worldY };
  }, []);

  // Mouse interaction handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    if (isDraggingRef.current) {
      if (cameraAnimRef.current) cameraAnimRef.current.active = false;
      transformRef.current.pan = {
        x: screenX - dragStartRef.current.x,
        y: screenY - dragStartRef.current.y,
      };
      return;
    }

    const world = screenToWorld(screenX, screenY);

    let found: Node | null = null;
    nodesRef.current.forEach((node) => {
      const dist = Math.hypot(node.x - world.x, node.y - world.y);
      if (dist < node.size + 16) {
        found = node;
      }
    });

    setHoveredNode(found);
    if (found) {
      setHoverPos({ x: screenX, y: screenY });
    } else {
      setHoverPos(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0 && !hoveredNode) {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = null;
        setPendingFocusNode(null);
      }
      if (cameraAnimRef.current) cameraAnimRef.current.active = false;
      isDraggingRef.current = true;
      dragStartRef.current = {
        x: e.clientX - canvasRef.current!.getBoundingClientRect().left - transformRef.current.pan.x,
        y: e.clientY - canvasRef.current!.getBoundingClientRect().top - transformRef.current.pan.y,
      };
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleMouseClick = () => {
    if (hoveredNode) {
      focusAndOpenNode(hoveredNode, 1500);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = null;
      setPendingFocusNode(null);
    }
    if (cameraAnimRef.current) cameraAnimRef.current.active = false;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.min(2.5, Math.max(0.5, transformRef.current.scale * zoomFactor));
    transformRef.current.scale = newScale;
    setZoomPercent(Math.round(newScale * 100));
  };

  // Zoom controls
  const handleZoomIn = () => {
    if (cameraAnimRef.current) cameraAnimRef.current.active = false;
    const newScale = Math.min(2.5, transformRef.current.scale * 1.2);
    transformRef.current.scale = newScale;
    setZoomPercent(Math.round(newScale * 100));
  };

  const handleZoomOut = () => {
    if (cameraAnimRef.current) cameraAnimRef.current.active = false;
    const newScale = Math.max(0.5, transformRef.current.scale / 1.2);
    transformRef.current.scale = newScale;
    setZoomPercent(Math.round(newScale * 100));
  };

  const handleResetView = () => {
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = null;
      setPendingFocusNode(null);
    }
    if (onClearSearch) onClearSearch();
    animateCameraTo(1, { x: 0, y: 0 }, 600);
  };

  // Switch focus to a connected node and auto-center
  const handleSelectConnectedNode = useCallback(
    (nodeId: string) => {
      const target = nodesByIdRef.current.get(nodeId);
      if (target) {
        focusAndOpenNode(target, 1500);
      }
    },
    [focusAndOpenNode]
  );

  // Parse connected nodes for the focused idea
  const getConnectedNodesForFocused = () => {
    if (!focusedNode) return [];
    const connectedIds = new Set<string>();

    links.forEach((l) => {
      if (l.source === focusedNode.id) {
        connectedIds.add(l.target);
      }
      if (l.target === focusedNode.id) {
        connectedIds.add(l.source);
      }
    });

    if (focusedNode.conexoesId) {
      const matches = focusedNode.conexoesId.match(/\d+/g);
      if (matches) {
        matches.forEach((id) => {
          if (id !== focusedNode.id) {
            connectedIds.add(id);
          }
        });
      }
    }

    return Array.from(connectedIds)
      .map((id) => nodesByIdRef.current.get(id))
      .filter((node): node is Node => Boolean(node));
  };

  const connectedNodes = getConnectedNodesForFocused();

  return (
    <div id="synaptic-graph-view" className="max-w-7xl w-full mx-auto py-6 sm:py-8 px-3 sm:px-6">
      {/* Header with Search Trigger */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs mb-2.5 font-medium">
          <Sparkles size={13} className="text-[#EBAF2D]" />
          <span>Consistem Sinapse · Grafo de Ideias</span>
        </div>
        <h2 className="font-sans text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-1.5">
          Mapeamento de Ideias
        </h2>
        <p className="text-xs sm:text-sm text-white/70 max-w-xl mx-auto font-normal leading-relaxed">
          Navegue pelas conexões ou use <strong className="text-white font-mono bg-white/10 px-1.5 py-0.5 rounded">Ctrl + K</strong> para pesquisar.
        </p>

        {/* Quick Search Bar Trigger in Header */}
        <div className="mt-3.5 flex items-center justify-center">
          <button
            id="open-semantic-search-btn"
            onClick={onOpenSearch}
            aria-label={searchQuery ? `Abrir pesquisa. Filtro atual: ${searchQuery}` : "Abrir pesquisa de ideias"}
            className="w-full max-w-md bg-[#18191C]/80 hover:bg-[#18191C] border border-white/15 hover:border-[#EBAF2D]/50 text-white/60 hover:text-white px-4 py-2.5 rounded-full text-xs transition-all shadow-md flex items-center justify-between gap-3 group"
          >
            <div className="flex items-center gap-2 truncate">
              <Search size={14} className="text-[#EBAF2D] group-hover:scale-110 transition-transform shrink-0" />
              <span className="truncate">
                {searchQuery ? `Filtro: "${searchQuery}"` : "Pesquisar ideias, temas ou tags..."}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1 font-mono text-[11px] bg-white/10 text-white/60 px-2 py-0.5 rounded shrink-0">
              <span>Ctrl + K</span>
            </div>
          </button>
        </div>
      </div>

      {/* Expanded Synaptic Canvas Area */}
      <div className="bg-[#18191C]/85 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.4)] flex flex-col relative">
        {loading ? (
          <div className="w-full min-h-[580px] sm:min-h-[620px] flex flex-col items-center justify-center bg-transparent">
            <Loader2 className="w-8 h-8 text-[#EBAF2D] animate-spin mb-3" />
            <span className="text-xs font-medium text-white/60">Carregando grafo de ideias...</span>
          </div>
        ) : ideas.length === 0 ? (
          <div className="w-full min-h-[580px] sm:min-h-[620px] flex flex-col items-center justify-center text-center px-6" role="status">
            <GitCommit size={32} className="text-[#EBAF2D] mb-4" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-white mb-2">Nenhuma ideia no grafo</h3>
            <p className="text-sm text-white/60 max-w-md leading-relaxed">
              Adicione ideias para visualizar suas conexões sinápticas aqui.
            </p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="w-full min-h-[580px] sm:min-h-[620px] bg-transparent relative flex items-center justify-center select-none"
          >
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={`Grafo interativo com ${ideas.length} ideias. Use a lista acessível de nós para abrir uma ideia.`}
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={handleMouseClick}
              onPointerUp={(e) => {
                if (e.pointerType !== "mouse") {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
                  const node = nodesRef.current.find(
                    (candidate) => Math.hypot(candidate.x - world.x, candidate.y - world.y) < candidate.size + 20
                  );
                  if (node) focusAndOpenNode(node, 0);
                }
              }}
              onWheel={handleWheel}
              className="w-full h-full cursor-grab active:cursor-grabbing block"
            />

            <div className="sr-only">
              <p>Lista de nós do grafo:</p>
              <ul>
                {ideas.map((idea) => (
                  <li key={idea.idNota}>
                    <button type="button" onClick={() => {
                      const node = nodesByIdRef.current.get(String(idea.idNota));
                      if (node) focusAndOpenNode(node, 0);
                    }}>
                      {formatShortTitle(idea.textoBruto, idea.temaMacro)}: {idea.textoBruto}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Floating Top-Left Telemetry Pill */}
            <div className="absolute top-4 left-4 flex items-center gap-2 text-xs font-sans text-white/70 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 pointer-events-none">
              <Activity size={13} className="text-[#EBAF2D]" />
              <span>
                {`${ideas.length} Ideias`}
              </span>
              <span className="text-white/30">|</span>
              <span className="text-white/50 text-[11px]">Zoom: {zoomPercent}%</span>
            </div>

            {/* Floating Centering / Focus Transition Pill (during 1.5s delay) */}
            <AnimatePresence>
              {pendingFocusNode && (
                <motion.div
                  initial={{ opacity: 0, y: -12, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.95 }}
                  transition={{ duration: 0.22 }}
                  className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 bg-[#18191C]/95 backdrop-blur-xl border border-[#EBAF2D]/60 text-white px-4 py-2 rounded-full shadow-[0_12px_32px_rgba(0,0,0,0.75)] text-xs"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EBAF2D] animate-ping shrink-0" />
                  <span className="text-white/70 font-medium">Centralizando nó</span>
                  <span className="font-semibold text-[#EBAF2D] truncate max-w-[220px]">
                    {formatIdeaReference(pendingFocusNode.id)} · {pendingFocusNode.shortTitle}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Floating Bottom Center Search Notification & Actions */}
            <AnimatePresence>
              {searchQuery && (
                <motion.div
                  initial={{ opacity: 0, y: 15, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-16 sm:bottom-5 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-2.5 bg-[#18191C]/95 backdrop-blur-xl border border-[#EBAF2D]/40 text-white px-3 sm:px-4 py-2 rounded-2xl sm:rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.7)]"
                >
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <span className="w-2 h-2 rounded-full bg-[#EBAF2D] animate-ping" />
                    <span className="text-white font-normal truncate max-w-[140px] sm:max-w-[200px]">
                      "{searchQuery}"
                    </span>
                    <span className="text-white/40">·</span>
                    <span className="text-white/80 font-mono text-[11px]">
                      {matchedNodeIds.size} {matchedNodeIds.size === 1 ? "destacado" : "destacados"}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 ml-1">
                    <button
                      id="btn-recenter-search"
                      onClick={centerHighlightedNodes}
                      aria-label="Centralizar nós destacados"
                      className="flex items-center gap-1 bg-[#EBAF2D]/20 hover:bg-[#EBAF2D]/30 text-[#EBAF2D] text-xs font-semibold px-2.5 py-1 rounded-full border border-[#EBAF2D]/30 transition-all shadow-sm"
                      title="Centralizar nós destacados na tela"
                    >
                      <Maximize2 size={11} />
                      <span>Centralizar</span>
                    </button>

                    <button
                      id="btn-reset-search"
                      onClick={handleResetView}
                      aria-label="Limpar pesquisa e redefinir visualização"
                      className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-2.5 py-1 rounded-full border border-white/15 transition-all shadow-sm"
                      title="Limpar pesquisa e redefinir visão"
                    >
                      <X size={12} />
                      <span>Limpar</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Hover Tooltip Overlay */}
            {hoveredNode && hoverPos && (
              <div
                className="hidden sm:block absolute z-30 pointer-events-none transition-transform duration-75 max-w-sm w-72 bg-[#18191C]/95 backdrop-blur-xl border border-white/20 p-3.5 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.7)]"
                style={{
                  left: Math.min(hoverPos.x + 16, (containerRef.current?.clientWidth || 900) - 300),
                  top: Math.max(hoverPos.y - 40, 16),
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#EBAF2D] shrink-0" />
                  <span className="font-mono text-[11px] text-white/50 bg-white/5 px-1.5 py-0.5 rounded">
                    {formatIdeaReference(hoveredNode.id)}
                  </span>
                  <span className="text-[11px] uppercase font-bold tracking-wider text-white/80">
                    {hoveredNode.type}
                  </span>
                  {matchedNodeIds.has(hoveredNode.id) && (
                    <span className="ml-auto text-[11px] font-semibold text-[#EBAF2D] bg-[#EBAF2D]/10 px-1.5 py-0.5 rounded border border-[#EBAF2D]/20">
                      Match Semântico
                    </span>
                  )}
                </div>

                <p className="text-xs text-white/95 leading-relaxed mb-2 font-normal line-clamp-4">
                  {hoveredNode.fullText}
                </p>

                {hoveredNode.palavrasChave && (
                  <div className="flex items-center gap-1 flex-wrap mb-2">
                    {hoveredNode.palavrasChave.split(",").slice(0, 3).map((tag, i) => (
                      <span
                        key={i}
                        className="text-[11px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded border border-white/5"
                      >
                        #{tag.trim()}
                      </span>
                    ))}
                  </div>
                )}

                <div className="text-[11px] text-[#EBAF2D] flex items-center gap-1 font-medium pt-1 border-t border-white/10">
                  <Maximize2 size={10} />
                  <span>Clique para abrir o Modo de Foco</span>
                </div>
              </div>
            )}



            {/* Floating Navigation Controls */}
            <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full p-1 shadow-lg">
              <button
                id="btn-zoom-in"
                onClick={handleZoomIn}
                aria-label="Aumentar zoom"
                className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-all"
                title="Aumentar Zoom (+)"
              >
                <ZoomIn size={15} />
              </button>

              <button
                id="btn-zoom-out"
                onClick={handleZoomOut}
                aria-label="Diminuir zoom"
                className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-all"
                title="Diminuir Zoom (-)"
              >
                <ZoomOut size={15} />
              </button>

              <div className="w-px h-4 bg-white/20 my-auto" />

              <button
                id="btn-recenter"
                onClick={centerHighlightedNodes}
                aria-label="Centralizar nós destacados"
                className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-all flex items-center gap-1"
                title="Centralizar nós destacados"
              >
                <Maximize2 size={14} />
              </button>

              <button
                id="btn-reset-view"
                onClick={handleResetView}
                aria-label="Redefinir visualização geral"
                className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/15 transition-all flex items-center gap-1"
                title="Redefinir visualização geral"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODO DE FOCO - Dedicated Focus Modal */}
      <AnimatePresence>
        {focusedNode && (
          <motion.div
            id="focus-mode-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                closeFocusedNode();
              }
            }}
          >
            <motion.div
              id="focus-mode-card"
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="focus-mode-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-2xl max-h-[calc(100vh-2rem)] w-full overflow-y-auto bg-[#18191C] border border-white/15 rounded-3xl p-6 sm:p-9 shadow-[0_24px_70px_rgba(0,0,0,0.85)] relative flex flex-col gap-6 my-auto"
            >
              <h2 id="focus-mode-title" className="sr-only">
                Ideia {focusedNode.shortTitle}, ID {focusedNode.id}
              </h2>
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: focusedNode.color }}
                    />
                    <span className="font-mono text-xs font-semibold text-white bg-white/5 border border-white/10 px-2.5 py-1 rounded-md">
                      {formatIdeaReference(focusedNode.id)}
                    </span>
                  </div>

                  <span className="text-xs font-semibold text-white bg-[#DF5241]/20 border border-[#DF5241]/40 px-3 py-1 rounded-full uppercase tracking-wider">
                    {focusedNode.type}
                  </span>

                  {focusedNode.dataCriacao && (
                    <span className="text-xs text-white/50 font-mono flex items-center gap-1.5 ml-1">
                      <Calendar size={12} />
                      {focusedNode.dataCriacao}
                    </span>
                  )}
                </div>

                <button
                  id="close-focus-mode-btn"
                  ref={closeModalButtonRef}
                  onClick={closeFocusedNode}
                  aria-label="Fechar modo de foco"
                  className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                  title="Fechar Modo de Foco (Esc)"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Main Content */}
              <div className="py-2">
                <p className="text-lg sm:text-xl text-white/95 font-normal leading-[1.6] whitespace-pre-wrap">
                  {focusedNode.fullText || focusedNode.shortTitle}
                </p>
              </div>

              {/* Keywords / Palavras-chave */}
              {focusedNode.palavrasChave && (
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <Tag size={13} className="text-white/40 shrink-0" />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {focusedNode.palavrasChave.split(",").map((tag, i) => (
                      <span
                        key={i}
                        className="text-xs text-white/70 bg-white/5 border border-white/10 px-2.5 py-1 rounded-md"
                      >
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Provocação da IA com Divulgação Progressiva */}
              <div className="pt-2 border-t border-white/10">
                {!showProvocation ? (
                  <button
                    id="btn-toggle-provocation"
                    onClick={() => setShowProvocation(true)}
                    aria-label="Mostrar provocação do Sinapse"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-white/15 text-xs text-white/80 hover:text-white hover:bg-white/5 transition-all group font-sans"
                  >
                    <Sparkles size={14} className="text-[#EBAF2D] group-hover:scale-110 transition-transform" />
                    <span>Gerar provocação com Sinapse</span>
                  </button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 sm:p-5 rounded-2xl bg-[#EBAF2D]/5 border border-[#EBAF2D]/20 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#EBAF2D] uppercase tracking-wider">
                        <Sparkles size={13} />
                        <span>Provocação do Sinapse</span>
                      </div>
                      <button
                        onClick={() => setShowProvocation(false)}
                        aria-label="Ocultar provocação do Sinapse"
                        className="text-[11px] text-white/40 hover:text-white/70 transition-colors"
                      >
                        Ocultar
                      </button>
                    </div>

                    <p className="text-xs sm:text-sm text-white/90 not-italic font-normal leading-relaxed">
                      {focusedNode.provocacoesFollowUp ||
                        "Como essa ideia se conecta diretamente aos objetivos operacionais e estratégicos da sua equipe no próximo trimestre?"}
                    </p>
                  </motion.div>
                )}
              </div>

              {/* Conexões Sinápticas */}
              <div className="space-y-2.5 pt-3 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-white/60 uppercase tracking-wider">
                    <GitCommit size={13} className="text-[#DF5241]" />
                    <span>Conexões Sinápticas ({connectedNodes.length})</span>
                  </div>
                  <span className="text-[11px] text-white/40 font-light">
                    Clique para navegar
                  </span>
                </div>

                {connectedNodes.length === 0 ? (
                  <p className="text-xs text-white/40">
                    Nenhuma outra anotação conectada a este nó no momento.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto pr-1">
                    {connectedNodes.map((conn) => (
                      <button
                        key={conn.id}
                        onClick={() => handleSelectConnectedNode(conn.id)}
                        className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-white/25 text-left transition-all flex items-start justify-between gap-2 group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: conn.color }}
                            />
                            <span className="font-mono text-[11px] text-white/60">
                              {formatIdeaReference(conn.id)}
                            </span>
                            <span className="text-[11px] text-white/80 font-medium truncate uppercase">
                              {conn.type}
                            </span>
                          </div>
                          <p className="text-xs text-white/85 truncate font-normal">
                            {conn.shortTitle || conn.fullText}
                          </p>
                        </div>
                        <ArrowRight
                          size={13}
                          className="text-white/40 group-hover:text-white group-hover:translate-x-0.5 transition-all mt-1 shrink-0"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Modal Footer Controls */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                <span className="text-[11px] text-white/40 font-mono">
                  Consistem Sinapse · Modo de Foco
                </span>
                <button
                  onClick={closeFocusedNode}
                  aria-label="Fechar modo de foco"
                  className="btn-consistem-outline px-5 py-2 text-xs font-semibold"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
