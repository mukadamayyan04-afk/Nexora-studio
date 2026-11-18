export type StudioScreen = 'viewport' | 'pipeline' | 'assets' | 'compute';

export type CameraMode = 'perspective' | 'isometric' | 'ortho-top';

export type AssetCategory = 'all' | 'hard-surface' | 'materials' | 'terrains';

export interface SceneTransform {
  posX: number;
  posY: number;
  posZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
}

export interface SceneMaterial {
  roughness: number;
  metallic: number;
  emissiveIntensity: number;
  rimTint: 'violet' | 'cyan' | 'dual';
  ior: number;
}

export interface SceneLighting {
  keyIntensity: number;
  fogDensity: number;
  ambientContrast: number;
  showWireframe: boolean;
  showBounds: boolean;
  showGrid: boolean;
}

export interface SceneLayer {
  id: string;
  name: string;
  type: 'mesh' | 'shader' | 'light' | 'camera';
  visible: boolean;
  locked: boolean;
  polyCount?: string;
}

export interface StudioAsset {
  id: string;
  title: string;
  category: Exclude<AssetCategory, 'all'>;
  imageUrl: string;
  polyCount: string;
  resolution: string;
  sizeMb: string;
  author: string;
  updatedAt: string;
  promptUsed: string;
  defaultMaterial: SceneMaterial;
}

export type SocketType = 'stream' | 'transform';

export interface GraphPort {
  id: string;
  label: string;
  type: SocketType;
}

export interface PipelineNodeParam {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

export interface PipelineNode {
  id: string;
  title: string;
  category: 'generator' | 'modifier' | 'shader' | 'output';
  x: number;
  y: number;
  enabled: boolean;
  inputs: GraphPort[];
  outputs: GraphPort[];
  params: PipelineNodeParam[];
  status: 'idle' | 'running' | 'compiled';
}

export interface PipelineEdge {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
  type: SocketType;
}

export interface ComputeScript {
  id: string;
  filename: string;
  targetPass: string;
  code: string;
  uniforms: {
    roughness: number;
    fresnelPower: number;
    rimIntensity: number;
    dispersion: number;
  };
}
