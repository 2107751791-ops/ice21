/** 将外部 GLB 模型接入史前21点压缩版 Three.js 场景。 */
(function setupPaleo21GlbReplacements() {
  "use strict";

  const definitions = Object.freeze({
    lion: { url: "./models/animals/cave-lion.glb", targetHeight: 0.92, rotationY: -Math.PI / 2, tint: 0xd8a665 },
    mammoth: { url: "./models/animals/woolly-mammoth.glb", targetHeight: 1.05, rotationY: -Math.PI / 2, tint: 0x9b806f },
    bison: { url: "./models/animals/steppe-bison.glb", targetHeight: 0.92, rotationY: -Math.PI / 2, tint: 0xb78057 },
    rhino: { url: "./models/animals/woolly-rhino.glb", targetHeight: 0.92, rotationY: -Math.PI / 2, tint: 0x9b8b7d },
    pika: { url: "./models/animals/northeast-pika.glb", targetHeight: 0.78, rotationY: -Math.PI / 2, tint: 0xd7b19a },
    "terrain-shrub": { url: "./models/terrain/shrubland.glb", targetWidth: 0.82, tint: 0x789a73 },
    "terrain-blank": { url: "./models/terrain/bare-ground.glb", targetWidth: 0.82, tint: 0xb79a79 },
    "terrain-snow": { url: "./models/terrain/snowfield.glb", targetWidth: 0.82, tint: 0xdce9ea },
    "terrain-grass": { url: "./models/terrain/grassland.glb", targetWidth: 0.82, tint: 0x91ad72 },
  });
  const assetCache = new Map();
  const replacementStatus = { loaded: {}, errors: {} };
  const textDecoder = new TextDecoder();

  function parseGlb(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
      throw new Error("模型不是有效的 GLB 2.0 文件");
    }
    const jsonLength = view.getUint32(12, true);
    const jsonType = view.getUint32(16, true);
    if (jsonType !== 0x4e4f534a) throw new Error("GLB 缺少 JSON 数据块");
    const json = JSON.parse(textDecoder.decode(new Uint8Array(arrayBuffer, 20, jsonLength)).trim());
    const binaryHeader = 20 + jsonLength;
    const binaryLength = view.getUint32(binaryHeader, true);
    const binaryType = view.getUint32(binaryHeader + 4, true);
    if (binaryType !== 0x004e4942) throw new Error("GLB 缺少二进制数据块");
    return { json, binary: arrayBuffer.slice(binaryHeader + 8, binaryHeader + 8 + binaryLength) };
  }

  function loadAsset(animal) {
    if (!assetCache.has(animal)) {
      const definition = definitions[animal];
      assetCache.set(animal, fetch(definition.url).then((response) => {
        if (!response.ok) throw new Error(`模型读取失败：${definition.url}`);
        return response.arrayBuffer();
      }).then(parseGlb));
    }
    return assetCache.get(animal);
  }

  function accessorData(asset, accessorIndex) {
    const accessor = asset.json.accessors[accessorIndex];
    const bufferView = asset.json.bufferViews[accessor.bufferView];
    const componentSize = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
    const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
    const ArrayType = {
      5120: Int8Array,
      5121: Uint8Array,
      5122: Int16Array,
      5123: Uint16Array,
      5125: Uint32Array,
      5126: Float32Array,
    }[accessor.componentType];
    const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const packedStride = componentSize * componentCount;
    const byteStride = bufferView.byteStride || packedStride;
    if (byteStride === packedStride) {
      return new ArrayType(asset.binary, byteOffset, accessor.count * componentCount);
    }
    const result = new ArrayType(accessor.count * componentCount);
    const source = new DataView(asset.binary);
    const readers = {
      5120: "getInt8",
      5121: "getUint8",
      5122: "getInt16",
      5123: "getUint16",
      5125: "getUint32",
      5126: "getFloat32",
    };
    const reader = readers[accessor.componentType];
    for (let item = 0; item < accessor.count; item += 1) {
      for (let component = 0; component < componentCount; component += 1) {
        result[item * componentCount + component] = source[reader](byteOffset + item * byteStride + component * componentSize, true);
      }
    }
    return result;
  }

  async function decodeImage(asset, imageDefinition) {
    const view = asset.json.bufferViews[imageDefinition.bufferView];
    const bytes = asset.binary.slice(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const blob = new Blob([bytes], { type: imageDefinition.mimeType || "image/png" });
    if (typeof createImageBitmap === "function") return createImageBitmap(blob);
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function createTextures(asset, three) {
    return Promise.all((asset.json.textures || []).map(async (textureDefinition) => {
      const imageDefinition = asset.json.images?.[textureDefinition.source];
      if (!imageDefinition?.bufferView) return null;
      const image = await decodeImage(asset, imageDefinition);
      const texture = new three.CanvasTexture(image);
      texture.flipY = false;
      texture.colorSpace = three.SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    }));
  }

  function colorFromFactor(factor = [1, 1, 1, 1]) {
    const channel = (value) => Math.max(0, Math.min(255, Math.round(value * 255)));
    return channel(factor[0]) * 65536 + channel(factor[1]) * 256 + channel(factor[2]);
  }

  function mixHex(base, tint, amount) {
    const channel = (value, shift) => (value >> shift) & 255;
    const mix = (a, b) => Math.round(a + (b - a) * amount);
    return mix(channel(base, 16), channel(tint, 16)) * 65536
      + mix(channel(base, 8), channel(tint, 8)) * 256
      + mix(channel(base, 0), channel(tint, 0));
  }

  function lightenHex(color, amount) {
    return mixHex(color, 0xffffff, amount);
  }

  async function buildScene(asset, three, visualDefinition) {
    const textures = await createTextures(asset, three);
    const materials = (asset.json.materials || []).map((definition) => {
      const pbr = definition.pbrMetallicRoughness || {};
      const alpha = pbr.baseColorFactor?.[3] ?? 1;
      const softenedColor = lightenHex(mixHex(colorFromFactor(pbr.baseColorFactor), visualDefinition.tint, 0.2), 0.18);
      return new three.MeshStandardMaterial({
        name: definition.name || "GLB material",
        color: softenedColor,
        map: pbr.baseColorTexture ? textures[pbr.baseColorTexture.index] : null,
        metalness: 0,
        roughness: Math.max(0.82, pbr.roughnessFactor ?? 1),
        emissive: visualDefinition.tint,
        emissiveIntensity: 0.12,
        side: definition.doubleSided ? 2 : 0,
        transparent: alpha < 1 || definition.alphaMode === "BLEND",
        opacity: alpha,
      });
    });

    const meshObjects = (asset.json.meshes || []).map((meshDefinition) => {
      const primitives = meshDefinition.primitives.map((primitive, primitiveIndex) => {
        const geometry = new three.BufferGeometry();
        geometry.setAttribute("position", new three.Float32BufferAttribute(accessorData(asset, primitive.attributes.POSITION), 3));
        if (primitive.attributes.NORMAL !== undefined) {
          geometry.setAttribute("normal", new three.Float32BufferAttribute(accessorData(asset, primitive.attributes.NORMAL), 3));
        } else {
          geometry.computeVertexNormals();
        }
        if (primitive.attributes.TEXCOORD_0 !== undefined) {
          geometry.setAttribute("uv", new three.Float32BufferAttribute(accessorData(asset, primitive.attributes.TEXCOORD_0), 2));
        }
        if (primitive.indices !== undefined) geometry.setIndex(Array.from(accessorData(asset, primitive.indices)));
        const material = materials[primitive.material] || new three.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
        const mesh = new three.Mesh(geometry, material);
        mesh.name = `${meshDefinition.name || "GLB mesh"}-${primitiveIndex + 1}`;
        return mesh;
      });
      if (primitives.length === 1) return primitives[0];
      const group = new three.Group();
      group.name = meshDefinition.name || "GLB mesh group";
      group.add(...primitives);
      return group;
    });

    const nodes = (asset.json.nodes || []).map((definition) => {
      const object = definition.mesh === undefined ? new three.Group() : meshObjects[definition.mesh];
      object.name = definition.name || object.name;
      if (definition.translation) object.position.fromArray(definition.translation);
      if (definition.rotation) object.quaternion.fromArray(definition.rotation);
      if (definition.scale) object.scale.fromArray(definition.scale);
      return object;
    });
    (asset.json.nodes || []).forEach((definition, index) => {
      for (const childIndex of definition.children || []) nodes[index].add(nodes[childIndex]);
    });
    const sceneDefinition = asset.json.scenes?.[asset.json.scene || 0];
    const root = new three.Group();
    root.name = sceneDefinition?.name || "GLB replacement";
    for (const nodeIndex of sceneDefinition?.nodes || []) root.add(nodes[nodeIndex]);
    return root;
  }

  function modelBounds(asset) {
    const primitive = asset.json.meshes?.[0]?.primitives?.[0];
    const accessor = primitive && asset.json.accessors?.[primitive.attributes.POSITION];
    if (!accessor?.min || !accessor?.max) return null;
    return { min: accessor.min, max: accessor.max };
  }

  function disposeObject(object) {
    object.traverse((node) => {
      node.geometry?.dispose?.();
      const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
      materials.forEach((material) => {
        material.map?.dispose?.();
        material.dispose?.();
      });
    });
  }

  async function hydrate(container, animal, three) {
    const definition = definitions[animal];
    if (!definition || container.userData.glbReplacementPending) return;
    container.userData.glbReplacementPending = true;
    try {
      const asset = await loadAsset(animal);
      const replacement = await buildScene(asset, three, definition);
      const bounds = modelBounds(asset);
      if (bounds) {
        const height = Math.max(0.0001, bounds.max[1] - bounds.min[1]);
        const scale = definition.targetHeight / height;
        replacement.scale.setScalar(scale);
        replacement.position.set(
          -(bounds.min[0] + bounds.max[0]) * 0.5 * scale,
          -bounds.min[1] * scale,
          -(bounds.min[2] + bounds.max[2]) * 0.5 * scale,
        );
      }
      const orientedReplacement = new three.Group();
      orientedReplacement.name = `${animal}-glb-orientation`;
      orientedReplacement.rotation.y = definition.rotationY || 0;
      orientedReplacement.add(replacement);
      const oldChildren = [...container.children];
      container.clear();
      container.add(orientedReplacement);
      oldChildren.forEach(disposeObject);
      container.userData.usingGlbReplacement = true;
      replacementStatus.loaded[animal] = (replacementStatus.loaded[animal] || 0) + 1;
      delete replacementStatus.errors[animal];
      document.documentElement.dataset.paleoGlbLoaded = Object.entries(replacementStatus.loaded)
        .map(([name, count]) => `${name}:${count}`)
        .join(",");
      window.dispatchEvent(new Event("resize"));
    } catch (error) {
      container.userData.glbReplacementPending = false;
      replacementStatus.errors[animal] = String(error?.message || error);
      document.documentElement.dataset.paleoGlbError = `${animal}:${replacementStatus.errors[animal]}`;
      console.error(`[史前21点] ${animal} GLB 替换失败，继续使用原模型。`, error);
    }
  }

  async function createScene(name, three) {
    const definition = definitions[name];
    if (!definition) throw new Error(`没有找到模型定义：${name}`);
    const asset = await loadAsset(name);
    const scene = await buildScene(asset, three, definition);
    const bounds = new three.Box3().setFromObject(scene);
    const size = bounds.getSize(new three.Vector3());
    const widest = Math.max(0.0001, size.x, size.z);
    const scale = (definition.targetWidth || 0.82) / widest;
    scene.scale.setScalar(scale);
    const scaledBounds = new three.Box3().setFromObject(scene);
    const center = scaledBounds.getCenter(new three.Vector3());
    scene.position.set(-center.x, -scaledBounds.min.y, -center.z);
    const root = new three.Group();
    root.name = `${name}-ar-model`;
    root.rotation.y = definition.rotationY || 0;
    root.add(scene);
    return root;
  }

  function has(animal) {
    return Object.prototype.hasOwnProperty.call(definitions, animal);
  }

  window.Paleo21GLBReplacement = Object.freeze({ has, hydrate, createScene, status: replacementStatus });
  document.documentElement.dataset.paleoGlbBridge = "ready";
  Object.keys(definitions).forEach((animal) => loadAsset(animal).catch(() => {}));
})();
