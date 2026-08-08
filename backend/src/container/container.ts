import type { Token } from "@shared/constants/tokens.js";

type Factory<T> = (container: Container) => T;

/**
 * Minimal typed DI container (composition-root friendly).
 * Controllers receive services via constructor injection resolved here.
 */
export class Container {
  private readonly singletons = new Map<Token, unknown>();
  private readonly factories = new Map<Token, Factory<unknown>>();

  registerSingleton<T>(token: Token, factory: Factory<T>): this {
    this.factories.set(token, factory as Factory<unknown>);
    return this;
  }

  registerValue<T>(token: Token, value: T): this {
    this.singletons.set(token, value);
    return this;
  }

  resolve<T>(token: Token): T {
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }

    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`DI: no registration for token ${String(token)}`);
    }

    const instance = factory(this) as T;
    this.singletons.set(token, instance);
    return instance;
  }

  has(token: Token): boolean {
    return this.singletons.has(token) || this.factories.has(token);
  }
}
