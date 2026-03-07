# HomeHub Frontend

This image is build-only.

`docker build` produces a final image that contains the frontend static files in `/dist`.

Example:

```bash
docker build -t homehub-frontend .
docker run --rm homehub-frontend ls -la /dist
```
