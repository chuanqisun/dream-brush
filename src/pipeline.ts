import {
  catchError,
  concatMap,
  defaultIfEmpty,
  EMPTY,
  finalize,
  from,
  fromEvent,
  ignoreElements,
  map,
  merge,
  mergeMap,
  of,
  Subject,
  take,
  tap,
  zip,
} from "rxjs";
import { AIConnection } from "./components/ai-connection";
import { CanvasSequenceExporter, type CanvasSequenceExporterStatus } from "./components/canvas-exporter";
import { CanvasHistory } from "./components/canvas-history";
import { CanvasStack } from "./components/canvas-stack";
import { CardQueue } from "./components/card-queue";
import { CharacterCanvas } from "./components/character-canvas";
import { DrawingCanvas } from "./components/draw-canvas";
import { editPainting, generatePainting } from "./components/generate-painting";
import { GenerativeCanvas } from "./components/generative-canvas";
import { startIdeaGeneration } from "./components/idea-generator";
import { identifyCharacter, identifyCharacterFast } from "./components/identify-character";
import { InputCalibrationController } from "./components/input-calibration";
import { PipelineMenuController } from "./components/pipeline-menu";
import { designSound } from "./components/sound-design";
import { generateSoundEffect, Soundscape } from "./components/soundscape";

export async function main() {
  const connection = new AIConnection();
  const drawCanvas = new DrawingCanvas("DrawCanvas");
  const generativeCanvas = new GenerativeCanvas("GenerativeCanvas", "OverlayCanvas");
  new CharacterCanvas("debug");
  const soundscape = new Soundscape();
  new CanvasStack("canvas-stack");
  const canvasStack = document.getElementById("canvas-stack")!;
  const exportDialog = document.getElementById("export-dialog") as HTMLDialogElement;
  const exportDirectoryButton = document.getElementById("export-directory-button") as HTMLButtonElement;
  const chooseExportDirectoryButton = document.getElementById("choose-export-directory") as HTMLButtonElement;
  const skipExportDirectoryButton = document.getElementById("skip-export-directory") as HTMLButtonElement;
  const exportStatus = document.getElementById("export-status") as HTMLSpanElement;
  const clearCanvasButton = document.getElementById("clear-canvas-button") as HTMLButtonElement;
  const ideaHints = new CardQueue("right", 5);
  const history = new CardQueue("left", 5);
  const menu = new PipelineMenuController({
    canvasStack,
    historyQueue: history,
    ideaQueue: ideaHints,
    soundscape,
  });

  generativeCanvas.clear();
  generativeCanvas.clearOverlay();

  const renderHistory = new CanvasHistory(generativeCanvas, { maxEntries: 40 });
  const exporter = new CanvasSequenceExporter(generativeCanvas.element);

  const syncExportUi = ({ directoryName, message, supportsDirectoryPicker }: CanvasSequenceExporterStatus) => {
    exportStatus.textContent = message;
    exportDirectoryButton.textContent = directoryName ? `Export: ${directoryName}` : "Export Dir";
    exportDirectoryButton.disabled = !supportsDirectoryPicker;
  };

  exporter.addEventListener("statuschange", (event) => {
    syncExportUi((event as CustomEvent<CanvasSequenceExporterStatus>).detail);
  });
  syncExportUi(exporter.status);

  const saveRenderedCanvas = async () => {
    renderHistory.capture();
    await exporter.captureFrame();
  };

  const clearRenderedCanvas = async () => {
    drawCanvas.clear();
    generativeCanvas.clear();
    generativeCanvas.clearOverlay();
    renderHistory.reset();
    await exporter.startSequence({ captureCurrentFrame: true });
  };

  const chooseExportDirectory = async (): Promise<boolean> => {
    const selected = await exporter.pickDirectory();
    if (!selected) {
      return false;
    }

    await exporter.startSequence({ captureCurrentFrame: true });
    return true;
  };

  clearCanvasButton.addEventListener("click", () => {
    void clearRenderedCanvas();
  });

  exportDirectoryButton.addEventListener("click", () => {
    void chooseExportDirectory();
  });

  chooseExportDirectoryButton.addEventListener("click", () => {
    void chooseExportDirectory().then((selected) => {
      if (selected) {
        exportDialog.close("selected");
      }
    });
  });

  skipExportDirectoryButton.addEventListener("click", () => {
    exportDialog.close("skipped");
  });

  if (exporter.supportsDirectoryPicker) {
    exportDialog.showModal();
  }

  const isTypingTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
  };

  window.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || isTypingTarget(event.target) || document.querySelector("dialog[open]")) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "z") {
      event.preventDefault();
      const changed = event.shiftKey ? renderHistory.redo() : renderHistory.undo();
      if (changed) {
        void exporter.captureFrame();
      }
    }
  });

  new InputCalibrationController({
    drawingCanvas: drawCanvas,
    canvasStack,
    overlayCanvas: document.getElementById("OverlayCanvas") as HTMLCanvasElement,
    triggerButton: document.getElementById("calibrate-toggle") as HTMLButtonElement,
    onStateChange: (state) => {
      menu.setCanvasAnchoring(state.shouldAnchorCanvas);
    },
  });

  const recognizedConcepts$ = new Subject<{ character: string; meaning: string }>();

  const ideasHinting$ = startIdeaGeneration(recognizedConcepts$).pipe(tap((idea) => ideaHints.add(idea)));
  ideasHinting$.subscribe();

  const program$ = fromEvent(drawCanvas, "drawingstop")
    .pipe(
      mergeMap(() => {
        const stack = document.querySelector(".canvas-stack")!;

        const dataUrl = drawCanvas.readBase64DataUrl();
        const boundingBox = drawCanvas.getBoundingBox();
        if (!boundingBox) {
          return EMPTY;
        }

        const charCanvasElement = CharacterCanvas.createElement(`CharacterCanvas-${Date.now()}`);
        const next = drawCanvas.element.nextSibling;
        if (next) stack.insertBefore(charCanvasElement, next);
        else stack.appendChild(charCanvasElement);
        const charCanvas = new CharacterCanvas(charCanvasElement.id);
        charCanvas.writeDataUrl(drawCanvas.readBase64DataUrl(true)).then(() => {
          drawCanvas.clear();
          charCanvas.startDrying(boundingBox);
        });
        const fast$ = from(identifyCharacterFast(connection, dataUrl)).pipe(
          tap((result) => console.log("Fast OCR", result)),
          map((meaning) => ({ identifiedMeaning: meaning, box: boundingBox, charCanvas })),
        );
        const slow$ = from(identifyCharacter(connection, dataUrl)).pipe(
          tap((result) => {
            console.log("Slow OCR", `${result.character} ${result.meaning}`);
            recognizedConcepts$.next(result);
            history.add(result);
          }),
          ignoreElements(),
        );
        return merge(fast$, slow$);
      }),
      concatMap((result) => {
        const isEmpty = generativeCanvas.isCanvasEmpty();
        const overlayImage = isEmpty ? null : generativeCanvas.getOverlayImage(result.box);
        console.log("Overlay Image:", { overlayImage, result });

        const visual$ = from(
          overlayImage ? editPainting(connection, overlayImage, result.identifiedMeaning) : generatePainting(connection, result.identifiedMeaning),
        ).pipe(
          concatMap((imageUrls) => from(imageUrls)),
          take(1),
          concatMap(async (imageUrl) => {
            await generativeCanvas.writeDataUrl(imageUrl);
            await saveRenderedCanvas();
          }),
          catchError((err) => {
            console.error("Visual generation error:", err);
            return of(null);
          }),
          finalize(() => {
            generativeCanvas.clearOverlay();
          }),
        );

        const sound$ = soundscape.sfxEnabled
          ? designSound({ connection, concept: result.identifiedMeaning }).pipe(
              mergeMap((description) => {
                console.log("Sound design description:", description);
                return generateSoundEffect(connection, description, soundscape.audioContext);
              }),
              catchError((err) => {
                console.warn("Sound generation failed, proceeding with visual only:", err);
                return of(null);
              }),
              defaultIfEmpty(null),
            )
          : of(null);

        return zip(visual$, sound$).pipe(
          mergeMap(([_, buffer]) => (buffer ? soundscape.play(buffer, { loopCount: 0, stopOthers: true }) : of(undefined))),
          catchError((err) => {
            console.error("Audio playback error:", err);
            return EMPTY;
          }),
        );
      }),
    )
    .pipe(
      finalize(() => {
        soundscape.stopAll();
      }),
    );

  program$.subscribe();
}

main();
