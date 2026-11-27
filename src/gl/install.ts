// Loaded before the game's own entry module on the 3D page: it leaves a factory where that module
// looks for one. The 2D page never imports this file, so three.js stays out of the 2D build.
import type { Stage } from '../client/render';
import { GLStage } from './stage';

(globalThis as { __hoopStage?: (overlay: HTMLCanvasElement) => Stage }).__hoopStage = (overlay) => new GLStage(overlay);
