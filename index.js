require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const Groq = require("groq-sdk");

const app = express();
app.use(cors());
app.use(express.json());

// ── Initialize Supabase and Groq ───────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Startup check ──────────────────────────────────────────
console.log("SUPABASE_URL loaded:", !!process.env.SUPABASE_URL);
console.log("SUPABASE_SERVICE_KEY loaded:", !!process.env.SUPABASE_SERVICE_KEY);
console.log("GROQ_API_KEY loaded:", !!process.env.GROQ_API_KEY);

// ── Keyword Retrieval ──────────────────────────────────────
function retrieveChunks(query, allChunks, topK = 3) {
  const queryWords = query.toLowerCase().split(/\s+/);
  const scored = allChunks.map(chunk => {
    const text = chunk.content.toLowerCase();
    const score = queryWords.filter(w => text.includes(w)).length;
    return { ...chunk, score };
  });
  return scored
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(c => c.content)
    .join("\n\n---\n\n");
}

// ── Health Check ───────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "✅ History Chatbot Backend is running!" });
});

// ── New Chat ───────────────────────────────────────────────
app.post("/api/chats/new", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  const { data, error } = await supabase
    .from("t_chat")
    .insert({ user_id: userId, title: "New Chat" })
    .select()
    .single();

  if (error) {
    console.error("New chat error:", error);
    return res.status(500).json({ error: error.message });
  }
  res.json({ chatId: data.chat_id });
});

// ── Get All Chats for a User ───────────────────────────────
app.get("/api/chats/:userId", async (req, res) => {
  const { userId } = req.params;
  console.log("Loading chats for userId:", userId);

  const { data, error } = await supabase
    .from("t_chat")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Get chats error:", error);
    return res.status(500).json({ error: error.message });
  }
  res.json({ chats: data });
});

// ── Get Messages for a Chat ────────────────────────────────
app.get("/api/messages/:chatId", async (req, res) => {
  const { chatId } = req.params;

  const { data, error } = await supabase
    .from("t_message")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Get messages error:", error);
    return res.status(500).json({ error: error.message });
  }
  res.json({ messages: data });
});

// ── Send Message ───────────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  const { userId, chatId, message } = req.body;

  if (!userId || !chatId || !message) {
    return res.status(400).json({ error: "userId, chatId and message are required" });
  }

  try {
    // 1. Load last 10 messages as history
    const { data: prevMessages, error: historyError } = await supabase
      .from("t_message")
      .select("role, content")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (historyError) throw new Error(historyError.message);
    const history = (prevMessages || []).reverse();

    // 2. Load all knowledge chunks
    const { data: chunks, error: knowledgeError } = await supabase
      .from("t_knowledge")
      .select("*");

    if (knowledgeError) throw new Error(knowledgeError.message);

    // 3. Find relevant chunks
    const knowledge = retrieveChunks(message, chunks || []);

    // 4. Build prompt
    const prompt = `
You are an assistant which answers questions based on knowledge which is provided to you.
While answering, you don't use your internal knowledge, but solely the information in the
"The knowledge" section. You don't mention anything to the user about the provided knowledge.
If the answer is not found in the knowledge, say "I don't have information about that in this textbook."

The question: ${message}
Conversation history: ${JSON.stringify(history)}
The knowledge: ${knowledge || "No relevant content found."}
    `;

    // 5. Call Groq API
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",  // free, fast, high quality
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
    });

    const reply = completion.choices[0].message.content;

    // 6. Save both messages
    const { error: saveError } = await supabase
      .from("t_message")
      .insert([
        { chat_id: chatId, role: "user",      content: message },
        { chat_id: chatId, role: "assistant", content: reply   }
      ]);

    if (saveError) throw new Error(saveError.message);

    res.json({ reply });

  } catch (err) {
    console.error("❌ Error in /api/chat:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Update Chat Title ──────────────────────────────────────
app.patch("/api/chats/:chatId/title", async (req, res) => {
  const { chatId } = req.params;
  const { title } = req.body;

  const { error } = await supabase
    .from("t_chat")
    .update({ title })
    .eq("chat_id", chatId);

  if (error) {
    console.error("Update title error:", error);
    return res.status(500).json({ error: error.message });
  }
  res.json({ success: true });
});

// ── Delete a Chat ──────────────────────────────────────────
app.delete("/api/chats/:chatId", async (req, res) => {
  const { chatId } = req.params;

  await supabase.from("t_message").delete().eq("chat_id", chatId);
  const { error } = await supabase.from("t_chat").delete().eq("chat_id", chatId);

  if (error) {
    console.error("Delete chat error:", error);
    return res.status(500).json({ error: error.message });
  }
  res.json({ success: true });
});

// ── Start Server ───────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});