export default class Env {
  constructor() {
    this.stack = [{}];
  }
  push() {
    this.stack.push({});
  }
  pop() {
    this.stack.pop();
  }
  get(name) {
    for (const env of this.stack) {
      if (env[name]) return env[name];
    }
    return undefined;
  }
  set(name, type) {
    this.stack[this.stack.length - 1][name] = type;
  }
}
