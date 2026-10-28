import Phaser from 'phaser'
import { WORLD_H, WORLD_W } from '../sim/step'
import { PlayScene } from './scene'

// The canvas is created at *native world resolution* and upscaled by Scale.FIT.
// Do not create it pre-multiplied: the sim and all drawing use unscaled world
// units, so a bigger canvas just leaves the world in the top-left corner.
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WORLD_W,
  height: WORLD_H,
  backgroundColor: '#0b0f14',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [PlayScene],
})
