import fullWalkthroughSubtitles from "./videos/full-walkthrough.vtt?url";
import fullWalkthroughVideo from "./videos/full-walkthrough.webm";
import hypeSubtitles from "./videos/hype.vtt?url";
import hypeVideo from "./videos/hype.webm";

// 2. Define your list of videos
const playlist = [fullWalkthroughVideo, hypeVideo];
const subtitles = [fullWalkthroughSubtitles, hypeSubtitles];

let currentVideoIndex = 0;
const player = document.getElementById("videoPlayer") as HTMLVideoElement;

// Create custom subtitles element absolute positioned against body
const subtitleContainer = document.createElement("div");
subtitleContainer.id = "custom-subtitles";
subtitleContainer.style.display = "none";
document.body.appendChild(subtitleContainer);

interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

function parseVTTTime(timeStr: string): number {
  const parts = timeStr.trim().split(":");
  let hrs = 0;
  let mins = 0;
  let secs = 0;

  if (parts.length === 3) {
    hrs = parseFloat(parts[0]);
    mins = parseFloat(parts[1]);
    secs = parseFloat(parts[2]);
  } else if (parts.length === 2) {
    mins = parseFloat(parts[0]);
    secs = parseFloat(parts[1]);
  }
  return hrs * 3600 + mins * 60 + secs;
}

function parseVTT(text: string): SubtitleCue[] {
  const lines = text.split(/\r?\n/);
  const cues: SubtitleCue[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes("-->")) {
      const parts = line.split("-->");
      if (parts.length < 2) {
        i++;
        continue;
      }
      const start = parseVTTTime(parts[0]);
      const endPart = parts[1].trim().split(/\s+/)[0];
      const end = parseVTTTime(endPart);

      const textLines: string[] = [];
      i++;
      while (i < lines.length) {
        const nextLine = lines[i].trim();
        if (nextLine === "") {
          break;
        }
        if (nextLine.includes("-->")) {
          i--;
          break;
        }
        textLines.push(nextLine);
        i++;
      }

      const cleanText = textLines.join("\n").replace(/<[^>]+>/g, "");
      if (cleanText) {
        cues.push({ start, end, text: cleanText });
      }
    }
    i++;
  }
  return cues;
}

let currentCues: SubtitleCue[] = [];

function updateSubtitles() {
  const currentTime = player.currentTime;
  const activeCues = currentCues.filter((cue) => currentTime >= cue.start && currentTime <= cue.end);

  if (activeCues.length > 0) {
    const joinedText = activeCues.map((cue) => cue.text).join("\n");
    if (subtitleContainer.textContent !== joinedText) {
      subtitleContainer.textContent = joinedText;
    }
    if (subtitleContainer.style.display !== "block") {
      subtitleContainer.style.display = "block";
    }
  } else {
    if (subtitleContainer.textContent !== "") {
      subtitleContainer.textContent = "";
    }
    if (subtitleContainer.style.display !== "none") {
      subtitleContainer.style.display = "none";
    }
  }
}

async function loadSubtitles(url: string) {
  currentCues = [];
  subtitleContainer.textContent = "";
  subtitleContainer.style.display = "none";
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch subtitles: ${response.statusText}`);
    }
    const text = await response.text();
    currentCues = parseVTT(text);
  } catch (error) {
    console.error("Error loading subtitles:", error);
  }
  updateSubtitles();
}

player.addEventListener("timeupdate", updateSubtitles);
player.addEventListener("seeked", updateSubtitles);

// 3. Listen for the "ended" event
player.addEventListener("ended", function () {
  // Move to the next video index
  currentVideoIndex++;

  // If we reach the end of the playlist, loop back to the first video
  if (currentVideoIndex >= playlist.length) {
    currentVideoIndex = 0;
  }

  player.setAttribute("data-index", currentVideoIndex.toString());

  // Dynamically load the correct subtitle track
  loadSubtitles(subtitles[currentVideoIndex]);

  // Update the source file and trigger playback
  player.src = playlist[currentVideoIndex];
  player.load();

  player.play().catch((error) => {
    console.log("Autoplay was blocked by the browser:", error);
  });
});

// Load original subtitles
loadSubtitles(subtitles[currentVideoIndex]);

// flip toggle
const flipToggle = document.getElementById("flip-toggle") as HTMLButtonElement;
flipToggle.addEventListener("click", () => {
  document.body.classList.toggle("flipped");
});
