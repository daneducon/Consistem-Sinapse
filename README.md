# Consistem Sinapse

Aplicação corporativa para capturar ideias, classificá-las com IA, armazená-las no Google Sheets e visualizá-las como um grafo de conhecimento.

## Requisitos

- Node.js 20 ou superior
- OAuth 2.0 Client ID do tipo Aplicativo da Web no Google Cloud Console
- Google Sheets API e Google Drive API habilitadas
- Credencial da OpenRouter

## Configuração

1. Execute `npm install`.
2. Copie as variáveis descritas em `.env.example` para `.env.local`.
3. Defina uma nova `OPENROUTER_API_KEY`; nunca use prefixo `VITE_` para segredos.
4. Configure o mesmo Client ID em `GOOGLE_CLIENT_ID` e `VITE_GOOGLE_CLIENT_ID`.
5. Cadastre `http://localhost:3000` e o domínio de produção em Origens JavaScript autorizadas no OAuth Client.
6. Confirme o domínio permitido em `ALLOWED_EMAIL_DOMAIN` e `VITE_ALLOWED_EMAIL_DOMAIN`.

No Google Cloud Console, habilite Google Sheets API e Google Drive API e configure a tela de consentimento OAuth. O escopo `drive.file` permite criar e manipular somente arquivos criados ou abertos pela aplicação, sem acesso irrestrito ao Drive.

## Desenvolvimento

- `npm run dev`: inicia API em `http://localhost:8080` e Vite em `http://localhost:3000`.
- `npm run lint`: executa o typecheck do cliente e do servidor.
- `npm test`: executa os testes automatizados.
- `npm run build`: gera `dist` e `dist-server`.
- `npm start`: inicia o servidor de produção após o build.

## Dados e integrações

- O navegador acessa Sheets e Drive com o token OAuth do usuário.
- A análise de ideias ocorre no backend autenticado e utiliza OpenRouter.
- Links podem ser lidos via Jina Reader, APIs públicas do YouTube e serviço de transcrição.
- O cache local é isolado por usuário e removido no logout.
- O backend valida o access token, o OAuth Client ID e o domínio corporativo diretamente no Google.
- A aplicação aceita, por padrão, apenas contas `@consistem.com.br`.

Não compartilhe conteúdo sigiloso sem aprovação para processamento pelos provedores externos. Política e retenção corporativas devem ser revisadas antes do deploy em produção.

## Planilha

A aba `Base` deve utilizar, nessa ordem: `ID_Nota`, `Data_Criacao`, `Texto_Bruto`, `Tema_Macro`, `Palavras_Chave`, `Conexoes_ID`, `Provocacoes_FollowUp`. A aplicação não sobrescreve cabeçalhos incompatíveis.

## Segurança

Revogue a chave OpenRouter que anteriormente esteve exposta no código. Removê-la do projeto não invalida a credencial no provedor.

## Deploy na Vercel

O projeto inclui `vercel.json` e uma Function catch-all em `api/[...path].ts`. Configure na Vercel:

- `OPENROUTER_API_KEY`
- `OPENROUTER_DEFAULT_MODEL`
- `OPENROUTER_FALLBACK_MODEL`
- `GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_CLIENT_ID`
- `ALLOWED_EMAIL_DOMAIN`
- `VITE_ALLOWED_EMAIL_DOMAIN`

Use o mesmo OAuth Client ID em `GOOGLE_CLIENT_ID` e `VITE_GOOGLE_CLIENT_ID`. No Google Cloud Console, adicione a URL final da Vercel em **Origens JavaScript autorizadas**. Variáveis `VITE_*` são públicas por definição; nunca use esse prefixo para a chave OpenRouter ou qualquer Client Secret.

Após o primeiro acesso a uma base antiga, use o aviso **Normalizar IDs** para substituir identificadores técnicos legados e atualizar suas conexões em lote.
