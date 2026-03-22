import express from "express";
import OBSWebSocket from "obs-websocket-js";
import tmi from "tmi.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const OBS_HOST = process.env.OBS_HOST || "ws://localhost:4455";
const OBS_PASSWORD = process.env.OBS_PASSWORD || "ehChlGxXEtujOYjo";
const PORT = process.env.PORT || 3000;
const TWITCH_CHANNEL = process.env.TWITCH_CHANNEL || "crinlorite";

const obs = new OBSWebSocket();
const app = express();
app.use(express.json());

// --- Twitch Chat ---
const chatMessages = [];
const MAX_CHAT_HISTORY = 100;

const twitchClient = new tmi.Client({
  channels: [TWITCH_CHANNEL],
});

twitchClient.connect().then(() => {
  console.log(`Connected to Twitch chat: #${TWITCH_CHANNEL}`);
}).catch(err => {
  console.error("Failed to connect to Twitch chat:", err.message);
});

twitchClient.on("message", (channel, tags, message, self) => {
  const msg = {
    id: tags.id || Date.now().toString(),
    user: tags["display-name"] || tags.username,
    color: tags.color || "#9147ff",
    message,
    timestamp: Date.now(),
  };
  chatMessages.push(msg);
  if (chatMessages.length > MAX_CHAT_HISTORY) chatMessages.shift();
});

// --- Connect to OBS ---
async function connectOBS() {
  const { obsWebSocketVersion } = await obs.connect(OBS_HOST, OBS_PASSWORD || undefined);
  console.log(`Connected to OBS v${obsWebSocketVersion}`);
}

// --- API routes ---
app.get("/api/status", async (req, res) => {
  try {
    const [sceneList, stream, rec, stats] = await Promise.all([
      obs.call("GetSceneList"),
      obs.call("GetStreamStatus"),
      obs.call("GetRecordStatus"),
      obs.call("GetStats"),
    ]);

    const { sceneItems } = await obs.call("GetSceneItemList", {
      sceneName: sceneList.currentProgramSceneName,
    });

    const inputs = [];
    for (const item of sceneItems) {
      try {
        const vol = await obs.call("GetInputVolume", { inputName: item.sourceName });
        const mute = await obs.call("GetInputMute", { inputName: item.sourceName });
        inputs.push({ name: item.sourceName, id: item.sceneItemId, visible: item.sceneItemEnabled, volumeDb: vol.inputVolumeDb, muted: mute.inputMuted, hasAudio: true });
      } catch {
        inputs.push({ name: item.sourceName, id: item.sceneItemId, visible: item.sceneItemEnabled, hasAudio: false });
      }
    }

    res.json({
      scene: sceneList.currentProgramSceneName,
      scenes: sceneList.scenes.reverse().map(s => s.sceneName),
      sources: inputs,
      stream: { active: stream.outputActive, timecode: stream.outputTimecode, reconnecting: stream.outputReconnecting },
      record: { active: rec.outputActive, paused: rec.outputPaused, timecode: rec.outputTimecode },
      stats: {
        cpu: stats.cpuUsage,
        memory: stats.memoryUsage,
        fps: stats.activeFps,
        disk: stats.availableDiskSpace / 1024,
        renderSkipped: stats.renderSkippedFrames,
        renderTotal: stats.renderTotalFrames,
        outputSkipped: stats.outputSkippedFrames,
        outputTotal: stats.outputTotalFrames,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/scene", async (req, res) => {
  try {
    await obs.call("SetCurrentProgramScene", { sceneName: req.body.name });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/toggle-source", async (req, res) => {
  try {
    const { id } = req.body;
    const { currentProgramSceneName } = await obs.call("GetSceneList");
    const { sceneItemEnabled } = await obs.call("GetSceneItemEnabled", { sceneName: currentProgramSceneName, sceneItemId: id });
    await obs.call("SetSceneItemEnabled", { sceneName: currentProgramSceneName, sceneItemId: id, sceneItemEnabled: !sceneItemEnabled });
    res.json({ ok: true, visible: !sceneItemEnabled });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/toggle-stream", async (req, res) => {
  try {
    const result = await obs.call("ToggleStream");
    res.json({ active: result.outputActive });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/toggle-record", async (req, res) => {
  try {
    const result = await obs.call("ToggleRecord");
    res.json({ active: result.outputActive });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/toggle-mute", async (req, res) => {
  try {
    const result = await obs.call("ToggleInputMute", { inputName: req.body.name });
    res.json({ muted: result.inputMuted });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/volume", async (req, res) => {
  try {
    await obs.call("SetInputVolume", { inputName: req.body.name, inputVolumeDb: req.body.db });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/toggle-record-pause", async (req, res) => {
  try {
    await obs.call("ToggleRecordPause");
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/preview", async (req, res) => {
  try {
    const { currentProgramSceneName } = await obs.call("GetSceneList");
    const { imageData } = await obs.call("GetSourceScreenshot", {
      sourceName: currentProgramSceneName,
      imageFormat: "jpg",
      imageCompressionQuality: 60,
      imageWidth: 960,
    });
    const base64 = imageData.replace(/^data:image\/[a-z]+;base64,/, "");
    res.set("Content-Type", "image/jpeg");
    res.set("Cache-Control", "no-store");
    res.send(Buffer.from(base64, "base64"));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/chat", (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const newMessages = chatMessages.filter(m => m.timestamp > since);
  res.json({ messages: newMessages });
});

// --- Serve UI ---
app.get("/", (req, res) => res.sendFile(join(__dirname, "ui.html")));

// --- Start ---
connectOBS().then(() => {
  app.listen(PORT, "0.0.0.0", () => console.log(`UI ready at http://0.0.0.0:${PORT}`));
}).catch(err => {
  console.error("Failed to connect to OBS:", err.message);
  process.exit(1);
});
