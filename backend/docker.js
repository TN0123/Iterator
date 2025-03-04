const Docker = require("dockerode");
const tar = require("tar-stream");

require("dotenv").config();

const docker = new Docker();

const startContainer = async () => {
  const container = await docker.createContainer({
    Image: "ubuntu",
    Tty: true,
    Cmd: ["/bin/bash"],
    HostConfig: {
      Binds: ["/tmp/codeStorage:/code"],
    },
  });
  await container.start();

  container.logs(
    {
      follow: true,
      stdout: true,
      stderr: true,
    },
    (err, stream) => {
      if (err) {
        console.error("Error getting container logs:", err);
        return;
      }
      stream.on("data", (chunk) => {
        console.log(chunk.toString());
      });
    }
  );

  return container;
};

const writeFilesToContainer = async (container, files) => {
  for (const [filename, content] of Object.entries(files)) {
    const filePath = `/code/${filename}`;
    const pack = tar.pack();

    pack.entry({ name: filename }, content);
    pack.finalize();

    const stream = await new Promise((resolve, reject) => {
      const buffer = [];
      pack.on("data", (chunk) => buffer.push(chunk));
      pack.on("end", () => resolve(Buffer.concat(buffer)));
      pack.on("error", reject);
    });

    await container.putArchive(stream, { path: "/code" });
    console.log(`File ${filename} written to container.`);
  }
};

const cleanUpContainer = async (container) => {
  await container.stop();
  await container.remove();
};

module.exports = {
  startContainer,
  writeFilesToContainer,
  cleanUpContainer,
};
