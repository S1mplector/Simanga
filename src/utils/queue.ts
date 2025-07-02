import PQueue from "p-queue";

export const downloadQueue = new PQueue({ concurrency: 3 }); 