/**
 * llm.js —— 模型调用封装（独立模块）
 *
 * 想更换模型服务时，只需要修改这一个文件，或者在 .env 里改配置。
 * 当前默认使用 OpenAI 兼容的 chat/completions 接口（DeepSeek、Moonshot、OpenAI 等都支持）。
 *
 * 安全约定：API Key 只从环境变量 LLM_API_KEY 读取，绝不写进代码、日志或返回给前端。
 */

const CONFIG = {
  apiKey: process.env.LLM_API_KEY || "",
  baseUrl:
    process.env.LLM_BASE_URL || "https://api.deepseek.com/v1/chat/completions",
  model: process.env.LLM_MODEL || "deepseek-chat",
};

/** 是否已配置模型服务 */
function isConfigured() {
  return Boolean(CONFIG.apiKey && CONFIG.apiKey.trim().length > 0);
}

/**
 * 调用大模型，返回文本回复。
 * @param {string} systemPrompt 系统提示词（约束模型行为）
 * @param {string} userPrompt 用户提示词（论文内容 + 任务）
 * @returns {Promise<string>} 模型的文本回复
 */
async function chat(systemPrompt, userPrompt) {
  if (!isConfigured()) {
    const err = new Error("模型服务未配置 API Key");
    err.code = "NOT_CONFIGURED";
    throw err;
  }

  const response = await fetch(CONFIG.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: CONFIG.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1, // 低温，减少编造
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // 注意：不要把请求头/密钥写进错误信息
    const err = new Error(
      `模型服务返回错误（HTTP ${response.status}）：${text.slice(0, 300)}`
    );
    err.code = "LLM_ERROR";
    throw err;
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    const err = new Error("模型服务返回了空内容");
    err.code = "LLM_ERROR";
    throw err;
  }
  return content;
}

/** 摘要任务的系统提示词 */
const SUMMARY_SYSTEM_PROMPT = `你是论文阅读助手。你的任务是完全基于用户提供的论文文本生成中文摘要。

严格规则：
1. 只能使用用户提供的论文文本中的信息，绝对不能使用你自己的常识或外部知识补充。
2. 如果论文文本中没有足够信息回答某个部分，就在该部分明确写"在提供的论文内容中没有找到足够依据"。
3. 每个部分的要点后面，尽量附上支持该要点的原文片段，格式为：【依据】"原文片段"。如果文本带有 [第X页] 标记，写成【依据·第X页】。
4. 输出必须是严格的 JSON，不要输出任何其他文字，结构如下：
{
  "研究问题": "……",
  "研究方法": "……",
  "主要结果": "……",
  "局限性": "……"
}`;

/** 问答任务的系统提示词 */
const QA_SYSTEM_PROMPT = `你是论文阅读助手。你的任务是完全基于用户提供的论文文本回答用户的问题。

严格规则：
1. 只能使用用户提供的论文文本中的信息回答，绝对不能使用你自己的常识或外部知识补充。
2. 如果论文文本中没有足够依据回答问题，必须明确回答："在提供的论文内容中没有找到足够依据"，不要编造。
3. 回答后附上支持回答的原文片段，格式为：【依据】"原文片段"。如果文本带有 [第X页] 标记，写成【依据·第X页】。
4. 用中文回答。`;

module.exports = { chat, isConfigured, SUMMARY_SYSTEM_PROMPT, QA_SYSTEM_PROMPT };
