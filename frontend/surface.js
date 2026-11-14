import { h, render } from 'vue';

// Synchronous rendering boundary for controllers that immediately wire a form,
// canvas or third-party widget after displaying it. Vue still owns the VNodes.
export class Surface {
  constructor(root, component) { this.root = root; this.component = component; root.replaceChildren(); }
  update(props) { render(h(this.component, props), this.root); this.active = true; }
  clear() { if (this.active) { render(null, this.root); this.active = false; } }
}
