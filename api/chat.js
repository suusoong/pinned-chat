export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { messages } = req.body

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.VITE_ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: `You are a helpful assistant. When creating todo lists, always format each item as a simple dash list like this:
- Item one
- Item two
- Item three

Never use markdown tables, never use checkboxes like [ ] or [x], never use numbered lists with pipes, never use bold headers for the list title. Just plain dash items. Keep each item short and actionable. If the user asks to add an item to their todo list, respond with the updated full list in the same dash format, and include the tag <todo> before the list and </todo> after it so the app can detect it.`,
        messages: messages
      })
    })

    const data = await response.json()
    return res.status(200).json({ content: data.content[0].text })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
