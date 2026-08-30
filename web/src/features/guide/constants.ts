/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type {
  AddressKind,
  ErrorRow,
  GuideTool,
  RouteId,
  UseCase,
} from './types'

export const GUIDE_UPDATED_AT = '2026-08-30'

export const USE_CASES: UseCase[] = [
  {
    id: 'chat',
    labelKey: 'Chat and writing',
    hintKey: 'Everyday chat, writing, and reading files',
  },
  {
    id: 'office',
    labelKey: 'Office and local files',
    hintKey: 'Chinese office agents that can touch local files',
  },
  {
    id: 'code',
    labelKey: 'Write code',
    hintKey: 'Editors, terminals, and coding agents',
  },
  {
    id: 'translate',
    labelKey: 'Translate pages',
    hintKey: 'Web pages, PDFs, and subtitles',
  },
  {
    id: 'workflow',
    labelKey: 'Knowledge bases and workflows',
    hintKey: 'Team chat, RAG, and automation',
  },
  {
    id: 'account',
    labelKey: 'Switch accounts and configs',
    hintKey: 'Keys, MCP, quotas, and multi-open IDEs',
  },
]

export const ROUTE_LABEL_KEYS: Record<RouteId, string> = {
  mainland: 'Mainland line',
  global: 'Global line',
  current: 'This site',
}

export const ROUTE_HINT_KEYS: Record<RouteId, string> = {
  mainland: 'Best for networks in mainland China',
  global: 'Cloudflare acceleration for overseas and cross-border networks',
  current: 'The address of the site you are on right now',
}

export const ADDRESS_KIND_LABEL_KEYS: Record<AddressKind, string> = {
  baseUrl: 'Base URL',
  host: 'API Host',
  path: 'API Path',
  fullUrl: 'Full URL',
}

export const ADDRESS_KIND_HINT_KEYS: Record<AddressKind, string> = {
  baseUrl: 'Use this when the app asks for Base URL, API Base, or API address',
  host: 'Use this when the app asks for API Host or Host only',
  path: 'Keep this path if the app has a separate path box',
  fullUrl: 'Use this when the app asks for a full endpoint',
}

export const TOOL_STATUS_LABEL_KEYS = {
  ready: 'Direct fill',
  config: 'Needs extra setup',
  protocol: 'Other protocol',
  blocked: 'No custom address',
} as const

export const GUIDE_TOOLS: GuideTool[] = [
  {
    id: 'cherry-studio',
    name: 'Cherry Studio',
    status: 'ready',
    useCases: ['chat'],
    beginnerPick: true,
    fillKey: 'OpenAI Compatible plus /v1',
    noteKey: 'Best first client for beginners',
    steps: [
      'Open Settings, then Model services, then Add.',
      'Choose OpenAI or OpenAI Compatible. Name it Yecao API.',
      'Paste your sk-... key. Paste the Base URL.',
      'Add the exact model ID, click Check, then turn the provider on.',
    ],
    mistakeKey:
      'If Check returns 404, try the host without /v1. Some versions add /v1 themselves.',
    successKey: 'The new model appears in the chat picker and replies to 你好.',
    docsUrl:
      'https://docs.cherry-ai.com/cherry-studio-wen-dang/en-us/pre-basic/providers/zi-ding-yi-fu-wu-shang',
    siteUrl: 'https://cherry-ai.com',
  },
  {
    id: 'chatbox',
    name: 'Chatbox',
    status: 'ready',
    useCases: ['chat'],
    beginnerPick: true,
    fillKey: 'API Host plus Path, or Base URL',
    noteKey: 'Friendly desktop chat client',
    steps: [
      'Open Settings, then Model provider, then Add.',
      'Choose OpenAI API compatible.',
      'If you see API Host, paste the host. If you see Base URL, paste Base URL.',
      'Paste the key, keep API Path as /v1/chat/completions if the box exists, then Check.',
    ],
    mistakeKey:
      'Do not paste a full /chat/completions URL into a Base URL box.',
    successKey: 'Check succeeds and a short test chat returns a reply.',
    docsUrl: 'https://docs.chatboxai.app/en/guides/providers',
    siteUrl: 'https://chatboxai.app',
  },
  {
    id: 'lobechat',
    name: 'LobeChat',
    status: 'ready',
    useCases: ['chat', 'workflow'],
    fillKey: 'OpenAI provider. API Proxy URL is the Base URL.',
    noteKey:
      'Open-source chat app. Turn off Responses API if /responses returns 404.',
    steps: [
      'Open Settings, then AI Service Provider, then OpenAI.',
      'Paste the key. Set API Proxy URL to the Base URL.',
      'Enable or add the exact model ID. Disable Responses API if that switch exists.',
      'Start a new chat and send 你好.',
    ],
    mistakeKey:
      'Do not paste the full /chat/completions URL into the proxy address.',
    successKey: 'A new chat using that model returns a reply.',
    docsUrl: 'https://lobehub.com/docs/usage/features/model-provider',
    siteUrl: 'https://lobechat.com',
  },
  {
    id: 'chatwise',
    name: 'ChatWise',
    status: 'ready',
    useCases: ['chat'],
    fillKey: 'OpenAI Compatible. API Base URL is the Base URL.',
    noteKey: 'Lightweight desktop chat client',
    steps: [
      'Open Settings, then Providers, then add OpenAI Compatible.',
      'Paste the Base URL, the key, and the exact model ID.',
      'Create a new chat and pick that model.',
    ],
    mistakeKey:
      'Do not leave the official OpenAI endpoint. The Base URL must be this site.',
    successKey: 'A short chat returns a reply.',
    siteUrl: 'https://chatwise.app',
  },
  {
    id: 'nextchat',
    name: 'NextChat',
    status: 'config',
    useCases: ['chat'],
    fillKey:
      'OpenAI endpoint. Use Base URL first, or Host if this build adds /v1 itself.',
    noteKey:
      'Also called ChatGPT Next Web. Self-hosted setups often use env vars.',
    steps: [
      'Open Settings and choose an OpenAI endpoint.',
      'Paste the key. Paste the Base URL first.',
      'If you get 404, try the host without /v1. Some builds append /v1 themselves.',
      'Set the model ID exactly, then send 你好.',
    ],
    mistakeKey: 'A doubled /v1/v1 path is the usual 404 here.',
    successKey: 'The chat page replies using the pasted model.',
    siteUrl: 'https://github.com/ChatGPTNextWeb/ChatGPT-Next-Web',
  },
  {
    id: 'workbuddy',
    name: 'WorkBuddy / CodeBuddy',
    status: 'ready',
    useCases: ['office', 'code'],
    beginnerPick: true,
    fillKey: 'Custom provider plus the full Chat URL',
    noteKey: 'Best Chinese office agent for local files',
    steps: [
      'Open the avatar menu, then Settings, then Models, then Add model.',
      'Choose Custom. Paste the full Chat URL.',
      'Paste the key and the exact model ID.',
      'For the first test, enable tool calling only.',
    ],
    mistakeKey:
      'Do not turn on Full URL and also paste a path that the app will append again.',
    successKey: 'The new model is selectable and can read a local file.',
    docsUrl: 'https://intl.cloud.tencent.com/zh/document/product/1300/80640',
    siteUrl: 'https://www.codebuddy.cn/work/',
  },
  {
    id: 'immersive-translate',
    name: 'Immersive Translate',
    status: 'ready',
    useCases: ['translate'],
    fillKey: 'OpenAI plus the full Chat URL',
    noteKey: 'Watch concurrency. Short pages first.',
    steps: [
      'Open settings and choose OpenAI or an OpenAI-compatible service.',
      'Paste the key and the exact model ID.',
      'Set the custom URL to the full Chat URL.',
      'Translate a short paragraph before a long page.',
    ],
    mistakeKey:
      '429 usually means too many tiny requests. Lower requests per second.',
    successKey: 'A short web paragraph translates without looping retries.',
    docsUrl: 'https://immersivetranslate.com/docs/services/openai/',
  },
  {
    id: 'fluent-read',
    name: 'FluentRead',
    status: 'ready',
    useCases: ['translate'],
    fillKey: 'OpenAI compatible Base URL, or full URL if required',
    noteKey: 'Prefer the one-click import when the console offers it',
    steps: [
      'Add an OpenAI-compatible translation service.',
      'Paste Base URL unless the app clearly asks for a full URL.',
      'Paste the key and model ID.',
      'Test a short page before a PDF.',
    ],
    mistakeKey: 'Do not paste /v1/v1 by combining Base URL and an extra path.',
    successKey: 'A short page translates and the next page still works.',
  },
  {
    id: 'trae',
    name: 'Trae',
    status: 'ready',
    useCases: ['code', 'office'],
    beginnerPick: true,
    fillKey:
      'Custom Config, OpenAI Chat Completions. Keep Full URL off and paste Base URL.',
    noteKey:
      'ByteDance AI IDE. Trae IDE and Trae Work use the same three fields.',
    steps: [
      'Open Settings, then Models, then Add Model.',
      'Choose Custom Config. Set the API format to OpenAI Chat Completions.',
      'Keep the Full URL switch off. Paste the Base URL, the key, and the exact model ID.',
      'Save, turn Auto Mode off if needed, pick the new model, then send 你好.',
    ],
    mistakeKey:
      'If Full URL is on, paste the full Chat URL instead. Do not paste Base URL into a full-URL box.',
    successKey: 'The new model appears in the picker and replies to 你好.',
    docsUrl: 'https://docs.trae.ai/ide/models',
    siteUrl: 'https://www.trae.ai',
  },
  {
    id: 'cline',
    name: 'Cline',
    status: 'ready',
    useCases: ['code'],
    beginnerPick: true,
    fillKey: 'OpenAI Compatible',
    noteKey: 'VS Code coding agent',
    steps: [
      'Install Cline, open the panel, then the gear.',
      'Set API Provider to OpenAI Compatible.',
      'Paste Base URL, the key, and the exact model ID.',
      'Ask it to explain a small file first.',
    ],
    mistakeKey:
      'If it chats but cannot edit files, the model likely lacks tool calling. Switch models.',
    successKey: 'It reads a small file and replies with the contents.',
    docsUrl: 'https://docs.cline.bot/provider-config/openai-compatible',
    siteUrl: 'https://cline.bot',
  },
  {
    id: 'roo-code',
    name: 'Roo Code',
    status: 'ready',
    useCases: ['code'],
    fillKey: 'OpenAI Compatible',
    noteKey: 'Needs native tool calling',
    steps: [
      'Open Roo Code settings and choose OpenAI Compatible.',
      'Paste Base URL, the key, and the exact model ID.',
      'Run a read-only mini task first.',
    ],
    mistakeKey:
      'A chat-only model cannot run agent tasks. Pick a model that supports tools.',
    successKey: 'A read-only task completes without protocol errors.',
    docsUrl:
      'https://github.com/RooCodeInc/Roo-Code/blob/main/apps/docs/docs/providers/openai-compatible.md',
  },
  {
    id: 'kilo-code',
    name: 'Kilo Code',
    status: 'ready',
    useCases: ['code'],
    fillKey: 'Custom provider plus OpenAI Compatible',
    noteKey: 'Good if you do not want to hand-edit config files',
    steps: [
      'Add a custom provider. Use yeschoy as the ID and Yecao API as the name.',
      'Choose OpenAI Compatible. Paste Base URL and the key.',
      'Pick a model from the list, or paste the exact model ID.',
      'Run a small tool-calling task.',
    ],
    mistakeKey:
      'Chat without file edits usually means the model has no working tools.',
    successKey: 'The agent can read and edit a small file.',
    docsUrl: 'https://kilo.ai/docs/code-with-ai/agents/custom-models',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    status: 'config',
    useCases: ['code'],
    fillKey: 'Custom provider in opencode.json',
    noteKey: 'Needs a config file, then /models',
    steps: [
      'Run /connect, choose Other, and use yeschoy as the provider ID.',
      'Set baseURL to the Base URL in opencode.json.',
      'Restart, run /models, and choose yeschoy/model-id.',
    ],
    mistakeKey: 'Do not put the full /chat/completions URL in baseURL.',
    successKey: 'A small project can be read, edited, and run.',
    docsUrl: 'https://opencode.ai/docs/providers',
  },
  {
    id: 'pi',
    name: 'Pi Coding Agent',
    status: 'config',
    useCases: ['code'],
    fillKey: 'models.json plus openai-completions',
    noteKey: 'Terminal agent with strong extensions',
    steps: [
      'Install Pi, then edit ~/.pi/agent/models.json.',
      'Set api to openai-completions and baseUrl to the Base URL.',
      'Export YESCHOY_API_KEY, run pi, then /model.',
    ],
    mistakeKey: 'Do not write the full Chat URL into baseUrl.',
    successKey: 'A short task can read the project and reply.',
    docsUrl: 'https://pi.dev/docs/latest/providers',
  },
  {
    id: 'continue',
    name: 'Continue',
    status: 'config',
    useCases: ['code'],
    fillKey: 'openai provider with apiBase',
    noteKey: 'You can disable Responses API if needed',
    steps: [
      'Add an openai provider block with apiBase, apiKey, and the model ID.',
      'Set useResponsesApi to false if /responses returns 404.',
    ],
    mistakeKey: 'A Chat Completions-only model will fail on /responses.',
    successKey: 'Inline chat replies using the pasted model ID.',
    docsUrl:
      'https://docs.continue.dev/customize/model-providers/top-level/openai',
  },
  {
    id: 'dify',
    name: 'Dify',
    status: 'ready',
    useCases: ['workflow'],
    fillKey: 'OpenAI provider with a custom URL',
    noteKey: 'Workspace admin only',
    steps: [
      'Open Settings, then Model providers, then OpenAI.',
      'Paste the key and set the custom base URL to Base URL.',
      'Add the exact model ID and test.',
    ],
    mistakeKey:
      'Some plugins only list official OpenAI models. Use a plugin that allows custom IDs.',
    successKey: 'A tiny prompt through that model returns a reply.',
    docsUrl: 'https://docs.dify.ai/zh-hans/guides/model-configuration/readme',
  },
  {
    id: 'open-webui',
    name: 'Open WebUI',
    status: 'ready',
    useCases: ['workflow', 'chat'],
    fillKey: 'Admin OpenAI connection',
    noteKey: 'Needs admin rights',
    steps: [
      'Open Admin settings, then Connections, then OpenAI.',
      'Add a connection with Base URL and the key.',
      'Leave model filter empty first. Add the model ID by hand if the list is empty.',
    ],
    mistakeKey: 'An empty model list does not always mean the key is dead.',
    successKey: 'The connection is enabled and a test chat replies.',
    docsUrl:
      'https://docs.openwebui.com/getting-started/quick-start/connect-a-provider/starting-with-openai-compatible/',
    siteUrl: 'https://openwebui.com',
  },
  {
    id: 'n8n',
    name: 'n8n',
    status: 'config',
    useCases: ['workflow'],
    fillKey: 'OpenAI credentials. The API URL is usually the Base URL.',
    noteKey: 'Workflow automation. Test with one node before a long flow.',
    steps: [
      'Create OpenAI credentials and paste the key.',
      'Set the API URL to the Base URL. If you get 404, try the host without /v1.',
      'In one OpenAI node, paste the exact model ID and run a short prompt.',
    ],
    mistakeKey:
      'A workflow with many nodes can burn quota fast. Test with one message first.',
    successKey: 'One OpenAI node returns a short reply.',
    docsUrl: 'https://docs.n8n.io/integrations/builtin/credentials/openai/',
    siteUrl: 'https://n8n.io',
  },
  {
    id: 'anythingllm',
    name: 'AnythingLLM',
    status: 'ready',
    useCases: ['workflow'],
    fillKey: 'OpenAI provider with the Base URL',
    noteKey: 'Local knowledge base. Chat first, then attach documents.',
    steps: [
      'Open Settings, then LLM Preference, then OpenAI.',
      'Paste the Base URL, the key, and the exact model ID.',
      'Save, then chat in an empty workspace before adding files.',
    ],
    mistakeKey:
      'Do not start with a large document ingest. Confirm chat works first.',
    successKey: 'A short workspace chat returns a reply.',
    docsUrl:
      'https://docs.anythingllm.com/setup/llm-configuration/cloud/openai',
    siteUrl: 'https://anythingllm.com',
  },
  {
    id: 'cc-switch',
    name: 'CC Switch',
    status: 'config',
    useCases: ['account', 'code'],
    fillKey: 'App-specific provider, not a generic sync',
    noteKey: 'A config switcher, not a chat app',
    steps: [
      'Pick the target app first, such as OpenCode.',
      'Add an app-specific provider. Do not start with a generic provider.',
      'Paste Base URL and the key, then fetch or paste the model ID.',
      'Enable it and fully restart the target app.',
    ],
    mistakeKey:
      'Do not sync one OpenAI Chat Completions profile onto Claude Code or Gemini CLI.',
    successKey: 'The target app restarts and uses the new provider.',
    docsUrl: 'https://github.com/Hortus-Edenensis/cc-switch',
  },
  {
    id: 'cockpit-tools',
    name: 'Cockpit Tools',
    status: 'config',
    useCases: ['account'],
    fillKey: 'Account manager, not an API client',
    noteKey: 'Managing an IDE login is not the same as custom API support',
    steps: [
      'Close the target app before switching accounts.',
      'Import the account and refresh quota first.',
      'Only fill Yecao API if that page has Base URL, Key, and Model ID.',
    ],
    mistakeKey:
      'If you only see import, quota, and launch, configure Yecao API in the real client instead.',
    successKey: 'Quota matches the account, and the IDE launches in isolation.',
    docsUrl: 'https://github.com/jlcodes99/cockpit-tools',
  },
  {
    id: 'codex',
    name: 'Codex',
    status: 'protocol',
    useCases: ['code'],
    fillKey: 'Responses API only',
    noteKey: 'Not a normal Chat Completions client',
    steps: [
      'Use Codex only with a model that supports /v1/responses.',
      'Set wire_api to responses and YESCHOY_API_KEY before launch.',
    ],
    mistakeKey:
      'If you see 404 /responses, switch to Cline, Roo Code, OpenCode, or Trae.',
    successKey: 'A Responses-capable model completes a short Codex task.',
    docsUrl: 'https://developers.openai.com/codex/config-file/config-reference',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    status: 'protocol',
    useCases: ['code'],
    fillKey: 'Needs an Anthropic-specific address',
    noteKey: 'Cannot use the OpenAI /v1 Chat URL',
    steps: [
      'Use Claude Code only if the platform gives an Anthropic-specific address.',
      'Set ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN.',
    ],
    mistakeKey:
      'Do not put https://yeschoy.com/v1 into ANTHROPIC_BASE_URL. Use Cline or OpenCode instead.',
    successKey: 'The Anthropic-specific address returns a messages reply.',
    docsUrl: 'https://docs.anthropic.com/en/docs/claude-code/llm-gateway',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    status: 'protocol',
    useCases: ['code'],
    fillKey: 'Needs a Gemini-specific address',
    noteKey: 'OpenAI-compatible URLs cannot replace Gemini native URLs',
    steps: [
      'Use Gemini CLI only if the platform gives a Gemini-specific address.',
      'Set GEMINI_API_KEY and GOOGLE_GEMINI_BASE_URL.',
    ],
    mistakeKey: 'An OpenAI Base URL will not make Gemini CLI work.',
    successKey: 'The Gemini-specific address lists models and replies.',
    docsUrl:
      'https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    status: 'config',
    useCases: ['code'],
    fillKey: 'Override OpenAI Base URL, with limits',
    noteKey: 'Tab completion still uses Cursor itself',
    steps: [
      'Open Cursor Settings, then Models.',
      'Paste the OpenAI API key and enable Override OpenAI Base URL.',
      'Paste Base URL, add the model ID, and test Ask/Chat first.',
    ],
    mistakeKey:
      'Do not start with a large Agent task. Cursor is not the most stable third-party relay client.',
    successKey: 'Ask/Chat replies with the pasted model before any Agent run.',
    docsUrl: 'https://docs.cursor.com/settings/api-keys',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    status: 'blocked',
    useCases: ['code'],
    fillKey: 'Official BYOK only, no generic custom Base URL',
    noteKey: 'Use Cline, Roo Code, Continue, or Trae instead',
    steps: [
      'Do not paste a Yecao key into official OpenAI, Anthropic, or Google boxes.',
      'Wait until Windsurf adds a custom OpenAI Compatible Base URL.',
    ],
    mistakeKey:
      'Filling an official key box does not point Windsurf at a relay.',
    successKey: 'Skip Windsurf for now and pick a ready client.',
    docsUrl: 'https://docs.windsurf.com/windsurf/models',
  },
]

export const ERROR_ROWS: ErrorRow[] = [
  {
    id: '401',
    symptomKey: '401 Invalid API key',
    meaningKey: 'The key is wrong, deleted, incomplete, or has extra spaces',
    actionKey: 'Copy the full key again. If it still fails, create a new one.',
  },
  {
    id: '404',
    symptomKey: '404 Not Found',
    meaningKey: 'The address or path is wrong, often a duplicated /v1',
    actionKey: 'Check whether /v1 or /chat/completions was added twice.',
  },
  {
    id: '400-model',
    symptomKey: '400 model not found',
    meaningKey: 'The model ID is wrong or this group cannot use it',
    actionKey: 'Copy the model ID again from the pricing page.',
  },
  {
    id: '400-format',
    symptomKey: '400 response_format unavailable',
    meaningKey: 'The client sent a format this model does not support',
    actionKey: 'Turn off JSON or structured output, or switch model or client.',
  },
  {
    id: 'reasoning',
    symptomKey: 'reasoning_content must be passed back',
    meaningKey: 'A thinking model is incompatible with this multi-turn client',
    actionKey: 'Start a new chat, upgrade the client, or turn thinking off.',
  },
  {
    id: '429',
    symptomKey: '429',
    meaningKey: 'Too many requests, or the quota window is full',
    actionKey: 'Slow down. Wait. Do not hammer retry.',
  },
  {
    id: '502',
    symptomKey: '502 all upstream attempts failed',
    meaningKey: 'Every available upstream failed for now',
    actionKey: 'Switch model or wait, and keep the request ID for feedback.',
  },
  {
    id: 'timeout',
    symptomKey: 'Spins, then fails after 30 seconds',
    meaningKey: 'The client timed out, or the first token is slow',
    actionKey: 'Raise timeout to 120 seconds and test a short question first.',
  },
  {
    id: 'tools',
    symptomKey: 'Chat works, file edits do not',
    meaningKey:
      'The model has no tool calling, or the tool protocol mismatches',
    actionKey: 'Switch to a model that clearly supports tools.',
  },
  {
    id: 'empty-models',
    symptomKey: 'Model list is empty',
    meaningKey: 'The client could not read /v1/models',
    actionKey:
      'Paste the model ID by hand. This does not always mean the key is dead.',
  },
  {
    id: 'full-url-switch',
    symptomKey: 'Trae or WorkBuddy fails right after saving',
    meaningKey: 'The Full URL switch does not match the address you pasted',
    actionKey:
      'If Full URL is off, paste Base URL. If it is on, paste the full Chat URL. Never mix them.',
  },
]

export const SAFETY_KEYS = [
  'Treat an API key like a bank password. Never send it in chat, screenshots, or git.',
  'If a key might have leaked, delete it and create a new one. You do not need to change the account password.',
  'Create one key per app, such as WorkBuddy or Cline, so you can revoke one leak without stopping everything.',
  'Prices differ by model. Read the pricing page before switching. Do not guess from the name.',
  'Long tasks, agents, page translation, and batch jobs can trigger many model calls.',
  'First connect with a short question. Confirm billing, the model, and tools before a large job.',
]
