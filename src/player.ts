import fullWalkthroughSubtitles from "./videos/full-walkthrough.vtt?url";
import fullWalkthroughVideo from "./videos/full-walkthrough.webm";
import hypeSubtitles from "./videos/hype.vtt?url";
import hypeVideo from "./videos/hype.webm";

// 2. Define your list of videos
const playlist = [fullWalkthroughVideo, hypeVideo];
const subtitles = [fullWalkthroughSubtitles, hypeSubtitles];

let currentVideoIndex = 0;
const player = document.getElementById("videoPlayer") as HTMLVideoElement;

// 3. Listen for the "ended" event
player.addEventListener("ended", function () {
  // Move to the next video index
  currentVideoIndex++;

  // If we reach the end of the playlist, loop back to the first video
  if (currentVideoIndex >= playlist.length) {
    currentVideoIndex = 0;
  }

  // Dynamically load the correct subtitle track
  const oldTrack = player.querySelector("track");
  if (oldTrack) {
    oldTrack.remove();
  }

  const newTrack = document.createElement("track");
  newTrack.label = "English";
  newTrack.kind = "subtitles";
  newTrack.srclang = "en";
  newTrack.src = subtitles[currentVideoIndex];
  newTrack.default = true;
  player.appendChild(newTrack);

  // Update the source file and trigger playback
  player.src = playlist[currentVideoIndex];
  player.load();

  // Ensure the subtitles are displayed automatically
  newTrack.track.mode = "showing";

  player.play().catch((error) => {
    console.log("Autoplay was blocked by the browser:", error);
  });
});

// flip toggle
const flipToggle = document.getElementById("flip-toggle") as HTMLButtonElement;
flipToggle.addEventListener("click", () => {
  document.body.classList.toggle("flipped");
});
