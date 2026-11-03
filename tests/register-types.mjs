import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith('.') &&
      !context.parentURL?.includes('/node_modules/') &&
      !/\.[a-z]+$/.test(specifier)
    )
      return next(specifier + '.ts', context);
    return next(specifier, context);
  },
});
