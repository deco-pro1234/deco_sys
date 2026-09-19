import { resolveOcrEndpoint, parseJsonFromText } from '@/lib/ocr'
import {
  FRAMEWORK_JSON_SCHEMA_HINT,
  FRAMEWORK_LIMITS,
  normalizeFrameworkDraft,
  type FrameworkDraft,
} from './frameworkDraft'

export type FrameworkAiSource = 'llm' | 'mock'

const SYSTEM_PROMPT = [
  '你是香港項目管理助手，把用戶的自然語言描述拆成最簡單的項目框架。',
  '只輸出 JSON，不要 markdown、解釋或額外文字。',
  '結構限制：大類（sections）最多 8 個；每個大類的下級（children）最多 10 個；事項總數最多 50。',
  '只允許兩層分組：大類 → 下級。不要更深。',
  '事項放在對應分組的 tasks；無法歸類的放 uncategorizedTasks。',
  'dueDate 不要輸出；事項 content 可簡短說明工作內容，沒有則 null。',
  '不要發明敏感個人資料；不要建立人員帳號或權限。',
  `輸出必須符合此結構：${FRAMEWORK_JSON_SCHEMA_HINT}`,
].join('\n')

function buildUserPrompt(description: string) {
  return [
    '請根據以下項目描述，產出項目框架 JSON。',
    '描述：',
    description,
  ].join('\n')
}

/** Heuristic mock so local/dev works without API key. */
export function mockFrameworkFromDescription(description: string): FrameworkDraft {
  const text = description.trim()
  const firstLine = text.split(/[\n。！？.!?]/)[0]?.trim() || '未命名項目'
  const hasTent = /帳篷|搭棚|搭建/.test(text)
  const hasSubcon = /分判|外判|承包|委託/.test(text)
  const hasEvent = /啤酒節|市集|展覽|活動|街市/.test(text)

  const eventTitle =
    text.match(/[\u4e00-\u9fffA-Za-z0-9]{2,40}(?:啤酒節|市集|展覽|活動)/)?.[0] ||
    text.match(/[^，,。．\n]{2,24}/)?.[0]
  const title = (eventTitle || firstLine).slice(0, 40)

  const sections: FrameworkDraft['sections'] = []

  if (hasEvent || hasTent) {
    sections.push({
      title: '現場搭建',
      description: hasTent ? '帳篷／現場設施搭建相關工作' : '現場相關工作',
      tasks: hasTent
        ? []
        : [{ title: '現場勘查與進場安排', content: null }],
      children: hasTent
        ? [
            {
              title: '帳篷 A',
              description: null,
              tasks: [
                { title: '帳篷 A 進場與定位', content: '確認位置與地台條件' },
                { title: '帳篷 A 搭建與固定', content: '依安全要求完成搭建' },
              ],
            },
            {
              title: '帳篷 B',
              description: null,
              tasks: [
                { title: '帳篷 B 進場與定位', content: null },
                { title: '帳篷 B 搭建與固定', content: null },
              ],
            },
          ]
        : [
            {
              title: '進場準備',
              description: null,
              tasks: [{ title: '物料清點與運輸', content: null }],
            },
          ],
    })
  }

  if (hasSubcon) {
    sections.push({
      title: '分判協調',
      description: '委託分判商完成相關工作之跟進',
      tasks: [
        { title: '確認分判範圍與報價', content: null },
        { title: '進場時程對接', content: null },
      ],
      children: [
        {
          title: '驗收與交接',
          description: null,
          tasks: [{ title: '完工檢查與問題清單', content: null }],
        },
      ],
    })
  }

  if (sections.length === 0) {
    sections.push({
      title: '項目執行',
      description: null,
      tasks: [{ title: '整理工作範圍與里程碑', content: text.slice(0, 200) }],
      children: [
        {
          title: '準備工作',
          description: null,
          tasks: [{ title: '確認資源與負責人', content: null }],
        },
      ],
    })
  }

  sections.push({
    title: '收尾',
    description: null,
    tasks: [{ title: '現場清場與文件歸檔', content: null }],
    children: [],
  })

  return normalizeFrameworkDraft({
    title,
    note: text.slice(0, FRAMEWORK_LIMITS.maxDescriptionLen),
    status: 'PLANNING',
    sections: sections.slice(0, FRAMEWORK_LIMITS.maxRoots),
    uncategorizedTasks: [],
  })
}

function extractAssistantText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
  }
  return ''
}

export async function generateFrameworkDraft(
  description: string
): Promise<{ draft: FrameworkDraft; source: FrameworkAiSource; model?: string }> {
  const apiKey = (process.env.PROJECT_AI_API_KEY || process.env.OCR_API_KEY || '').trim()
  const allowMock =
    (process.env.PROJECT_AI_ALLOW_MOCK || 'true').toLowerCase() !== 'false'

  if (!apiKey) {
    if (!allowMock) {
      throw new Error('PROJECT_AI_API_KEY_MISSING')
    }
    return { draft: mockFrameworkFromDescription(description), source: 'mock' }
  }

  const model =
    (process.env.PROJECT_AI_MODEL || process.env.OCR_MODEL || 'gpt-4.1-mini').trim()
  const timeoutMs = Number(process.env.PROJECT_AI_TIMEOUT_MS || 45000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(
      resolveOcrEndpoint(process.env.PROJECT_AI_API_BASE_URL || process.env.OCR_API_BASE_URL),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(description) },
          ],
        }),
      }
    )

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const msg = payload?.error?.message || 'PROJECT_AI_REQUEST_FAILED'
      throw new Error(msg)
    }

    const text = extractAssistantText(payload)
    const parsed = parseJsonFromText(text)
    return {
      draft: normalizeFrameworkDraft(parsed),
      source: 'llm',
      model,
    }
  } finally {
    clearTimeout(timer)
  }
}
