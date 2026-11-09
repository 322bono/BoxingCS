/** Each input source owns its hold; another finger cannot release it. */
export class HeldControls {
  private keyboard = new Set<string>();
  private pointers = new Map<number, Set<string>>();

  add(key: string) {
    this.keyboard.add(key);
  }
  delete(key: string) {
    this.keyboard.delete(key);
  }
  has(key: string) {
    return (
      this.keyboard.has(key) ||
      [...this.pointers.values()].some((keys) => keys.has(key))
    );
  }
  pressPointer(id: number, key: string) {
    let keys = this.pointers.get(id);
    if (!keys) this.pointers.set(id, (keys = new Set()));
    keys.add(key);
  }
  releasePointer(id: number, key?: string) {
    if (key === undefined) this.pointers.delete(id);
    else {
      const keys = this.pointers.get(id);
      keys?.delete(key);
      if (!keys?.size) this.pointers.delete(id);
    }
  }
  clear() {
    this.keyboard.clear();
    this.pointers.clear();
  }
}
