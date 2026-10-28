import Phaser from 'phaser'
import { VIEW_H, VIEW_W } from '../sim/constants'
import { PlayScene } from './scene'

// The canvas is created at *native world resolution* and upscaled by Scale.FIT.
// Do not create it pre-multiplied: the sim and all drawing use unscaled world
// units, so a bigger canvas just leaves the world in the top-left corner.
//
// The canvas is deliberately smaller than a room (20x12 tiles) so the camera
// has to scroll and occlusion bugs have somewhere to show up.
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#0b0f14',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [PlayScene],
})
