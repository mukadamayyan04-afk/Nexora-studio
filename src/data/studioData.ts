import turbineImg from '../assets/images/viewport_hyper_turbine_1794739669884.jpg';
import obsidianImg from '../assets/images/asset_obsidian_shader_1794739669855.jpg';
import droneImg from '../assets/images/asset_recon_drone_1794739670990.jpg';
import basaltImg from '../assets/images/asset_basalt_terrain_1794739670650.jpg';
import {
  ComputeScript,
  PipelineEdge,
  PipelineNode,
  SceneLayer,
  SceneLighting,
  SceneMaterial,
  SceneTransform,
  StudioAsset,
} from '../types/studio';

export const INITIAL_ASSETS: StudioAsset[] = [
  {
    id: 'asset-turbine',
    title: 'Propulsion Turbine Mk-IV',
    category: 'hard-surface',
    imageUrl: turbineImg,
    polyCount: '2.4M tris',
    resolution: '4K PBR',
    sizeMb: '42.8 MB',
    author: 'K. Vance',
    updatedAt: 'Updated today',
    promptUsed: 'Anodized titanium propulsion turbine with carbon-fiber intake vanes and violet rim contour',
    defaultMaterial: {
      roughness: 0.24,
      metallic: 0.88,
      emissiveIntensity: 0.65,
      rimTint: 'violet',
      ior: 1.54,
    },
  },
  {
    id: 'asset-obsidian',
    title: 'Liquid Obsidian Calibration Sphere',
    category: 'materials',
    imageUrl: obsidianImg,
    polyCount: '480K tris',
    resolution: '8K Procedural',
    sizeMb: '18.4 MB',
    author: 'M. Sato',
    updatedAt: 'Updated 2h ago',
    promptUsed: 'Faceted volcanic obsidian core framed by brushed dark chrome ribs with dual spectral speculars',
    defaultMaterial: {
      roughness: 0.12,
      metallic: 0.72,
      emissiveIntensity: 0.4,
      rimTint: 'dual',
      ior: 1.72,
    },
  },
  {
    id: 'asset-drone',
    title: 'Autonomous Recon Chassis',
    category: 'hard-surface',
    imageUrl: droneImg,
    polyCount: '1.6M tris',
    resolution: '4K PBR',
    sizeMb: '31.2 MB',
    author: 'A. Mercer',
    updatedAt: 'Updated yesterday',
    promptUsed: 'Modular quad-rotor reconnaissance frame in matte slate aluminum with cyan optical array',
    defaultMaterial: {
      roughness: 0.36,
      metallic: 0.78,
      emissiveIntensity: 0.55,
      rimTint: 'cyan',
      ior: 1.48,
    },
  },
  {
    id: 'asset-basalt',
    title: 'Volcanic Basalt Heightfield',
    category: 'terrains',
    imageUrl: basaltImg,
    polyCount: '4.1M tris',
    resolution: '8K Displacement',
    sizeMb: '64.0 MB',
    author: 'R. Lindqvist',
    updatedAt: 'Updated 3d ago',
    promptUsed: 'Eroded basalt canyon terrain tile with volumetric mist layers and cool horizon rim lighting',
    defaultMaterial: {
      roughness: 0.68,
      metallic: 0.14,
      emissiveIntensity: 0.35,
      rimTint: 'dual',
      ior: 1.38,
    },
  },
];

export const INITIAL_TRANSFORM: SceneTransform = {
  posX: 0,
  posY: 0,
  posZ: 0,
  rotX: 4,
  rotY: -8,
  rotZ: 0,
  scale: 1,
};

export const INITIAL_MATERIAL: SceneMaterial = {
  roughness: 0.24,
  metallic: 0.88,
  emissiveIntensity: 0.65,
  rimTint: 'violet',
  ior: 1.54,
};

export const INITIAL_LIGHTING: SceneLighting = {
  keyIntensity: 84,
  fogDensity: 28,
  ambientContrast: 62,
  showWireframe: false,
  showBounds: true,
  showGrid: true,
};

export const INITIAL_LAYERS: SceneLayer[] = [
  { id: 'layer-primary', name: 'Primary_Mesh_LOD0', type: 'mesh', visible: true, locked: false, polyCount: '2.4M' },
  { id: 'layer-shader', name: 'PBR_Obsidian_Graph', type: 'shader', visible: true, locked: false },
  { id: 'layer-rim-light', name: 'Rim_Array_Spectral', type: 'light', visible: true, locked: false },
  { id: 'layer-cam', name: 'Main_Cine_Camera', type: 'camera', visible: true, locked: true },
];

export const INITIAL_PIPELINE_NODES: PipelineNode[] = [
  {
    id: 'node-seed',
    title: 'Prompt Latent Field',
    category: 'generator',
    x: 48,
    y: 110,
    enabled: true,
    inputs: [],
    outputs: [
      { id: 'out-mesh', label: 'Base Geometry', type: 'stream' },
      { id: 'out-xform', label: 'Bounds Matrix', type: 'transform' },
    ],
    params: [
      { key: 'guidance', label: 'Guidance Scale', value: 7.5, min: 1, max: 15, step: 0.5 },
      { key: 'octaves', label: 'Detail Octaves', value: 6, min: 1, max: 12, step: 1 },
    ],
    status: 'compiled',
  },
  {
    id: 'node-retopo',
    title: 'Adaptive Quad Remesh',
    category: 'modifier',
    x: 340,
    y: 60,
    enabled: true,
    inputs: [
      { id: 'in-mesh', label: 'Raw Surface', type: 'stream' },
      { id: 'in-xform', label: 'Symmetry Axis', type: 'transform' },
    ],
    outputs: [{ id: 'out-quad', label: 'Clean Topology', type: 'stream' }],
    params: [
      { key: 'targetK', label: 'Target Density', value: 240, min: 32, max: 512, step: 16, unit: 'K' },
      { key: 'crease', label: 'Crease Threshold', value: 34, min: 5, max: 90, step: 1, unit: '°' },
    ],
    status: 'compiled',
  },
  {
    id: 'node-pbr',
    title: 'Spectral PBR Baker',
    category: 'shader',
    x: 340,
    y: 290,
    enabled: true,
    inputs: [{ id: 'in-surface', label: 'Cage Stream', type: 'stream' }],
    outputs: [{ id: 'out-mat', label: 'Material Bundle', type: 'transform' }],
    params: [
      { key: 'roughness', label: 'Micro-Roughness', value: 0.24, min: 0.02, max: 1, step: 0.02 },
      { key: 'anisotropy', label: 'Anisotropy', value: 0.62, min: 0, max: 1, step: 0.02 },
    ],
    status: 'compiled',
  },
  {
    id: 'node-composite',
    title: 'Viewport Stage Output',
    category: 'output',
    x: 650,
    y: 160,
    enabled: true,
    inputs: [
      { id: 'in-geo', label: 'Geometry Stream', type: 'stream' },
      { id: 'in-mat', label: 'Shader Binding', type: 'transform' },
    ],
    outputs: [],
    params: [
      { key: 'lodBias', label: 'LOD Bias', value: 0, min: -2, max: 2, step: 0.25 },
      { key: 'bloom', label: 'Rim Bloom', value: 0.48, min: 0, max: 1, step: 0.04 },
    ],
    status: 'compiled',
  },
];

export const INITIAL_PIPELINE_EDGES: PipelineEdge[] = [
  {
    id: 'edge-1',
    fromNodeId: 'node-seed',
    fromPortId: 'out-mesh',
    toNodeId: 'node-retopo',
    toPortId: 'in-mesh',
    type: 'stream',
  },
  {
    id: 'edge-2',
    fromNodeId: 'node-seed',
    fromPortId: 'out-xform',
    toNodeId: 'node-retopo',
    toPortId: 'in-xform',
    type: 'transform',
  },
  {
    id: 'edge-3',
    fromNodeId: 'node-seed',
    fromPortId: 'out-mesh',
    toNodeId: 'node-pbr',
    toPortId: 'in-surface',
    type: 'stream',
  },
  {
    id: 'edge-4',
    fromNodeId: 'node-retopo',
    fromPortId: 'out-quad',
    toNodeId: 'node-composite',
    toPortId: 'in-geo',
    type: 'stream',
  },
  {
    id: 'edge-5',
    fromNodeId: 'node-pbr',
    fromPortId: 'out-mat',
    toNodeId: 'node-composite',
    toPortId: 'in-mat',
    type: 'transform',
  },
];

export const INITIAL_COMPUTE_SCRIPTS: ComputeScript[] = [
  {
    id: 'script-obsidian',
    filename: 'obsidian_refraction.wgsl',
    targetPass: 'Deferred Glass & Dielectric Specular',
    uniforms: {
      roughness: 0.16,
      fresnelPower: 3.4,
      rimIntensity: 0.78,
      dispersion: 0.28,
    },
    code: `struct MaterialUniforms {
  roughness: f32,
  fresnel_power: f32,
  rim_intensity: f32,
  dispersion: f32,
};

@group(0) @binding(0) var<uniform> params: MaterialUniforms;

fn eval_spectral_fresnel(n_dot_v: f32, power: f32) -> vec3<f32> {
  let base = pow(1.0 - clamp(n_dot_v, 0.0, 1.0), power);
  let violet = vec3<f32>(0.545, 0.361, 0.965);
  let cyan   = vec3<f32>(0.024, 0.714, 0.831);
  return mix(violet, cyan, base * params.dispersion) * params.rim_intensity;
}

@fragment
fn fs_main(@location(0) normal: vec3<f32>, @location(1) view_dir: vec3<f32>) -> @location(0) vec4<f32> {
  let n_dot_v = max(dot(normalize(normal), normalize(view_dir)), 0.001);
  let rim = eval_spectral_fresnel(n_dot_v, params.fresnel_power);
  let obsidian_albedo = vec3<f32>(0.042, 0.042, 0.068) * (1.0 - params.roughness * 0.25);
  return vec4<f32>(obsidian_albedo + rim, 1.0);
}`,
  },
  {
    id: 'script-turbine',
    filename: 'turbine_rim_light.wgsl',
    targetPass: 'Anisotropic Titanium Brushed Pass',
    uniforms: {
      roughness: 0.26,
      fresnelPower: 2.6,
      rimIntensity: 0.86,
      dispersion: 0.42,
    },
    code: `struct AnisoUniforms {
  roughness: f32,
  fresnel_power: f32,
  rim_intensity: f32,
  dispersion: f32,
};

@group(0) @binding(0) var<uniform> u: AnisoUniforms;

fn ward_anisotropic(h: vec3<f32>, t: vec3<f32>, b: vec3<f32>, n: vec3<f32>) -> f32 {
  let ax = max(u.roughness * 0.45, 0.02);
  let ay = max(u.roughness * 1.15, 0.04);
  let ht = dot(h, t) / ax;
  let hb = dot(h, b) / ay;
  let hn = max(dot(h, n), 0.001);
  return exp(-2.0 * (ht * ht + hb * hb) / (1.0 + hn));
}

@fragment
fn fs_aniso(@location(0) n: vec3<f32>, @location(1) v: vec3<f32>) -> @location(0) vec4<f32> {
  let rim = pow(1.0 - max(dot(n, v), 0.0), u.fresnel_power) * u.rim_intensity;
  let contour = mix(vec3<f32>(0.816, 0.737, 1.0), vec3<f32>(0.298, 0.843, 0.965), u.dispersion);
  return vec4<f32>(vec3<f32>(0.08, 0.09, 0.12) + contour * rim, 1.0);
}`,
  },
  {
    id: 'script-basalt',
    filename: 'basalt_erosion.comp',
    targetPass: 'Thermal Hydraulic Heightfield Kernel',
    uniforms: {
      roughness: 0.64,
      fresnelPower: 1.9,
      rimIntensity: 0.52,
      dispersion: 0.68,
    },
    code: `struct TerrainParams {
  roughness: f32,
  fresnel_power: f32,
  rim_intensity: f32,
  dispersion: f32,
};

@group(0) @binding(0) var<uniform> cfg: TerrainParams;
@group(0) @binding(1) var<storage, read_write> height_map: array<f32>;

@compute @workgroup_size(8, 8, 1)
fn cs_erode(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.y * 512u + gid.x;
  let h = height_map[idx];
  let talus = mix(0.018, 0.092, cfg.roughness);
  let eroded = h - max(0.0, h - talus) * cfg.dispersion * 0.12;
  height_map[idx] = clamp(eroded, 0.0, 1.0);
}`,
  },
];
