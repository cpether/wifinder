import { createApp } from "./server.js";

const port = Number(process.env.PORT ?? 3000);
const { server } = createApp();

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`WiFinder API listening on :${port}`);
});
