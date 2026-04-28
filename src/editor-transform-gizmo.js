import { TransformControls } from 'three/addons/controls/TransformControls.js';

export function createEditorTransformGizmo({
  camera,
  domElement,
  scene,
  defaultMode = 'translate',
  modeButtons = {},
  hotkeys = true,
  onDraggingChanged = () => {},
  onChange = () => {},
  onObjectChange = () => {}
}) {
  let dragging = false;
  const controls = new TransformControls(camera, domElement);
  controls.setMode(defaultMode);
  controls.addEventListener('dragging-changed', (event) => {
    dragging = event.value;
    onDraggingChanged(event.value);
  });
  controls.addEventListener('change', onChange);
  controls.addEventListener('objectChange', onObjectChange);
  scene.add(controls.getHelper());

  function setMode(mode) {
    controls.setMode(mode);
    for (const [buttonMode, button] of Object.entries(modeButtons)) {
      button?.classList.toggle('secondary', buttonMode !== mode);
    }
  }

  for (const [mode, button] of Object.entries(modeButtons)) {
    button?.addEventListener('click', () => setMode(mode));
  }

  function isTypingTarget(target) {
    const tagName = target?.tagName?.toLowerCase();
    return target?.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
  }

  if (hotkeys && typeof window !== 'undefined') {
    window.addEventListener('keydown', (event) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'w') {
        setMode('translate');
        event.preventDefault();
      } else if (key === 'e') {
        if (!modeButtons.rotate?.disabled) setMode('rotate');
        event.preventDefault();
      } else if (key === 'r') {
        setMode('scale');
        event.preventDefault();
      } else if (key === 'q') {
        event.preventDefault();
      }
    });
  }

  setMode(defaultMode);

  return {
    controls,
    attach: (object) => controls.attach(object),
    detach: () => controls.detach(),
    setMode,
    get mode() { return controls.mode; },
    get dragging() { return dragging; },
    get object() { return controls.object; }
  };
}
