import OBSWebSocket from "obs-websocket-js";
import readline from "readline";

// --- Configuration ---
const OBS_HOST = process.env.OBS_HOST || "ws://localhost:4455";
const OBS_PASSWORD = process.env.OBS_PASSWORD || "ehChlGxXEtujOYjo";

const obs = new OBSWebSocket();

// --- Connection ---
async function connect() {
  try {
    const { obsWebSocketVersion, negotiatedRpcVersion } = await obs.connect(
      OBS_HOST,
      OBS_PASSWORD || undefined
    );
    console.log(
      `Connected to OBS v${obsWebSocketVersion} (RPC v${negotiatedRpcVersion})`
    );
  } catch (err) {
    console.error("Failed to connect:", err.message);
    process.exit(1);
  }
}

// --- Event listeners ---
function setupEventListeners() {
  obs.on("StreamStateChanged", ({ outputActive, outputState }) => {
    console.log(`[Event] Stream: ${outputState} (active: ${outputActive})`);
  });

  obs.on("RecordStateChanged", ({ outputActive, outputState }) => {
    console.log(`[Event] Recording: ${outputState} (active: ${outputActive})`);
  });

  obs.on("CurrentProgramSceneChanged", ({ sceneName }) => {
    console.log(`[Event] Scene changed to: ${sceneName}`);
  });

  obs.on("SceneItemEnableStateChanged", ({ sceneName, sceneItemId, sceneItemEnabled }) => {
    console.log(`[Event] Source ${sceneItemId} in "${sceneName}": ${sceneItemEnabled ? "shown" : "hidden"}`);
  });

  obs.on("ConnectionClosed", () => {
    console.log("[Event] Connection closed");
    process.exit(0);
  });
}

// --- Commands ---
async function getScenes() {
  const { currentProgramSceneName, scenes } = await obs.call("GetSceneList");
  console.log(`\nCurrent scene: ${currentProgramSceneName}`);
  console.log("Available scenes:");
  scenes.reverse().forEach((s, i) => {
    const marker = s.sceneName === currentProgramSceneName ? " <--" : "";
    console.log(`  ${i + 1}. ${s.sceneName}${marker}`);
  });
  return scenes;
}

async function setScene(name) {
  await obs.call("SetCurrentProgramScene", { sceneName: name });
  console.log(`Switched to scene: ${name}`);
}

async function getStreamStatus() {
  const status = await obs.call("GetStreamStatus");
  console.log("\nStream status:");
  console.log(`  Active: ${status.outputActive}`);
  console.log(`  Reconnecting: ${status.outputReconnecting}`);
  if (status.outputActive) {
    console.log(`  Duration: ${status.outputTimecode}`);
    console.log(`  Bytes sent: ${status.outputBytes}`);
    console.log(`  Skipped frames: ${status.outputSkippedFrames}`);
    console.log(`  Total frames: ${status.outputTotalFrames}`);
  }
}

async function getRecordStatus() {
  const status = await obs.call("GetRecordStatus");
  console.log("\nRecord status:");
  console.log(`  Active: ${status.outputActive}`);
  console.log(`  Paused: ${status.outputPaused}`);
  if (status.outputActive) {
    console.log(`  Duration: ${status.outputTimecode}`);
    console.log(`  Bytes: ${status.outputBytes}`);
  }
}

async function getStats() {
  const stats = await obs.call("GetStats");
  console.log("\nOBS Stats:");
  console.log(`  CPU usage: ${stats.cpuUsage.toFixed(1)}%`);
  console.log(`  Memory: ${(stats.memoryUsage).toFixed(1)} MB`);
  console.log(`  Available disk: ${(stats.availableDiskSpace / 1024).toFixed(2)} GB`);
  console.log(`  Active FPS: ${stats.activeFps.toFixed(1)}`);
  console.log(`  Render skipped: ${stats.renderSkippedFrames}/${stats.renderTotalFrames}`);
  console.log(`  Output skipped: ${stats.outputSkippedFrames}/${stats.outputTotalFrames}`);
}

async function toggleStream() {
  const result = await obs.call("ToggleStream");
  console.log(`Stream is now: ${result.outputActive ? "LIVE" : "STOPPED"}`);
}

async function toggleRecord() {
  const result = await obs.call("ToggleRecord");
  console.log(`Recording is now: ${result.outputActive ? "ON" : "OFF"}`);
}

async function toggleRecordPause() {
  await obs.call("ToggleRecordPause");
  console.log("Record pause toggled");
}

async function getSourcesList() {
  const { currentProgramSceneName } = await obs.call("GetSceneList");
  const { sceneItems } = await obs.call("GetSceneItemList", {
    sceneName: currentProgramSceneName,
  });
  console.log(`\nSources in "${currentProgramSceneName}":`);
  sceneItems.forEach((item) => {
    const visibility = item.sceneItemEnabled ? "visible" : "hidden";
    console.log(`  [${item.sceneItemId}] ${item.sourceName} (${visibility})`);
  });
}

async function toggleSource(sceneItemId) {
  const { currentProgramSceneName } = await obs.call("GetSceneList");
  const { sceneItemEnabled } = await obs.call("GetSceneItemEnabled", {
    sceneName: currentProgramSceneName,
    sceneItemId: parseInt(sceneItemId),
  });
  await obs.call("SetSceneItemEnabled", {
    sceneName: currentProgramSceneName,
    sceneItemId: parseInt(sceneItemId),
    sceneItemEnabled: !sceneItemEnabled,
  });
  console.log(
    `Source ${sceneItemId}: ${!sceneItemEnabled ? "shown" : "hidden"}`
  );
}

async function setVolume(inputName, volumeDb) {
  await obs.call("SetInputVolume", {
    inputName,
    inputVolumeDb: parseFloat(volumeDb),
  });
  console.log(`Volume for "${inputName}" set to ${volumeDb} dB`);
}

async function toggleMute(inputName) {
  const result = await obs.call("ToggleInputMute", { inputName });
  console.log(
    `"${inputName}" is now ${result.inputMuted ? "muted" : "unmuted"}`
  );
}

async function screenshot(sourceName) {
  const { imageData } = await obs.call("GetSourceScreenshot", {
    sourceName,
    imageFormat: "png",
    imageWidth: 1280,
  });
  const base64 = imageData.replace(/^data:image\/png;base64,/, "");
  const filename = `screenshot_${Date.now()}.png`;
  const { writeFileSync } = await import("fs");
  writeFileSync(filename, Buffer.from(base64, "base64"));
  console.log(`Screenshot saved: ${filename}`);
}

// --- REPL ---
function printHelp() {
  console.log(`
OBS Remote Commands:
  scenes              List all scenes
  scene <name>        Switch to scene by name
  sources             List sources in current scene
  toggle <id>         Toggle source visibility by ID

  stream              Toggle stream on/off
  stream-status       Show stream status
  record              Toggle recording on/off
  record-status       Show recording status
  pause               Toggle recording pause

  stats               Show OBS performance stats
  mute <input>        Toggle mute for an input
  volume <input> <dB> Set volume (e.g. volume Mic -5)
  screenshot <source> Take a screenshot of a source

  help                Show this help
  quit                Disconnect and exit
`);
}

async function handleCommand(input) {
  const [cmd, ...args] = input.trim().split(/\s+/);
  if (!cmd) return;

  try {
    switch (cmd) {
      case "scenes":
        await getScenes();
        break;
      case "scene":
        if (!args.length) return console.log("Usage: scene <name>");
        await setScene(args.join(" "));
        break;
      case "sources":
        await getSourcesList();
        break;
      case "toggle":
        if (!args[0]) return console.log("Usage: toggle <sceneItemId>");
        await toggleSource(args[0]);
        break;
      case "stream":
        await toggleStream();
        break;
      case "stream-status":
        await getStreamStatus();
        break;
      case "record":
        await toggleRecord();
        break;
      case "record-status":
        await getRecordStatus();
        break;
      case "pause":
        await toggleRecordPause();
        break;
      case "stats":
        await getStats();
        break;
      case "mute":
        if (!args.length) return console.log("Usage: mute <inputName>");
        await toggleMute(args.join(" "));
        break;
      case "volume":
        if (args.length < 2) return console.log("Usage: volume <inputName> <dB>");
        await setVolume(args.slice(0, -1).join(" "), args.at(-1));
        break;
      case "screenshot":
        if (!args.length) return console.log("Usage: screenshot <sourceName>");
        await screenshot(args.join(" "));
        break;
      case "help":
        printHelp();
        break;
      case "quit":
      case "exit":
        await obs.disconnect();
        process.exit(0);
        break;
      default:
        console.log(`Unknown command: ${cmd}. Type "help" for commands.`);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
  }
}

async function main() {
  console.log("OBS Remote Control");
  console.log("==================\n");

  await connect();
  setupEventListeners();
  printHelp();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "obs> ",
  });

  rl.prompt();
  rl.on("line", async (line) => {
    await handleCommand(line);
    rl.prompt();
  });
  rl.on("close", () => process.exit(0));
}

main();
