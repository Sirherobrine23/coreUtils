# apindex - static file index generator/load reducer

Generate a file index for Github Pages

## What is this?

This is a program that generates `index.html` files in each directory on your server that render the file tree. This is useful for static web servers that need support for file listing. One example of this is Github Pages.

It can also be used to reduce the server load for servers that serve static content, as the server does not need to generate the index each time it is accessed. Basically permanent cache.

The file icons are also embedded into the `index.html` file so there is no need for aditional HTTP requests.

## How do I use it?

Install with `npm i -g index-pages` and run `apindex` to current folder, `apindex ./folder` or `apindex /`.

else if run with npx: `npx index-pages ./`