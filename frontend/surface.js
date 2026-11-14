import { h, render } from 'vue';
import { documentResources } from './runtime/resources.js';

// Synchronous rendering boundary for controllers that immediately wire a form,
// canvas or third-party widget after displaying it. Vue still owns the VNodes.
export class Surface {
  constructor(root, component) { this.root = root; this.component = component; this.owner = documentResources(root); root.replaceChildren(); }
  update(props) {
    if (this.owner && !this.owner.active) return;
    if (!this.release) this.release = this.owner?.defer(() => this.clear());
    const node = h(this.component, props); node.appContext = this.owner?.appContext;
    render(node, this.root); this.active = true;
  }
  clear() {
    if (this.active) { render(null, this.root); this.active = false; }
    this.release?.(); this.release = null;
  }
}
