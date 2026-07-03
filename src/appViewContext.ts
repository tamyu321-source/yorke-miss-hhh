import { defineComponent, inject, type InjectionKey } from 'vue';

export type AppViewContext = Record<string, any>;

export const appViewContextKey: InjectionKey<AppViewContext> = Symbol('app-view-context');

export function useAppViewContext() {
  const context = inject(appViewContextKey);
  if (!context) {
    throw new Error('App view context was not provided.');
  }
  return context;
}

export function createContextViewComponent(name: string) {
  return defineComponent({
    name,
    setup() {
      return useAppViewContext();
    }
  });
}
