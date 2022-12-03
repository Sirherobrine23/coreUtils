# Sirherobrine23 Core Utils

Um pequeno pacote que contem varios Utilitarios.

## Utilitarios

1. HTTP Client.
2. Um extensão do `node:fs`.
3. Um `child process` em promise.

## Instalação

Como esse pacote não está no registro do NPM, você tera que instalar da seguinte forma:

primeiro se você não estiver autenticado no registro do Github packages, faça login: [Auth Github packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages). (quick: `npm login --registry="https://npm.pkg.github.com" --scope="@sirherobrine23"`)

adicione no `.npmrc` (tem que está na mesma pasta que o `package.json`) a seguinte linha:

```
@sirherobrine23:registry=https://npm.pkg.github.com
```

e instalar como qualquer outro módulo: `npm install @sirherobrine23/coreutils`
