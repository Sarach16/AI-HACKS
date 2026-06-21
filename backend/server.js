import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import { NARRATOR_SYSTEM_PROMPT, buildNarrationUserPrompt } from "./narratorPrompt.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("[warn] ANTHROPIC_API_KEY is not set — /api/narrate will fail.");
}
if (!process.env.DEEPGRAM_API_KEY) {
  console.warn("[warn] DEEPGRAM_API_KEY is not set — /api/speak will fail.");
}

/**
 * POST /api/narrate
 * body: { placeName, extract, distanceMeters }
 * returns: { script }
 *
 * Rewrites a raw Wikipedia extract into a short spoken-style narration.
 */
app.post("/api/narrate", async (req, res) => {
  const { placeName, extract, distanceMeters } = req.body;

  if (!placeName || !extract) {
    return res.status(400).json({ error: "placeName and extract are required" });
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: NARRATOR_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildNarrationUserPrompt({ placeName, extract, distanceMeters: distanceMeters ?? 0 }),
        },
      ],
    });

    const script = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    res.json({ script });
  } catch (err) {
    console.error("narrate error:", err);
    res.status(500).json({ error: "Failed to generate narration" });
  }
});

/**
 * POST /api/speak
 * body: { text }
 * returns: audio/mpeg stream
 *
 * Converts narration script to audio using Deepgram Aura TTS.
 */
app.post("/api/speak", async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }

  try {
    const dgResponse = await fetch(
      "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      }
    );

    if (!dgResponse.ok) {
      const errBody = await dgResponse.text();
      console.error("Deepgram error:", dgResponse.status, errBody);
      return res.status(502).json({ error: "TTS provider error" });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    const buffer = Buffer.from(await dgResponse.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    console.error("speak error:", err);
    res.status(500).json({ error: "Failed to synthesize audio" });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));
