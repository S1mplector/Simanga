import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const ContinueBanner: React.FC = () => {
  const [progress, setProgress] = useState<any>();
  const navigate = useNavigate();
  useEffect(() => {
    (window as any).library.lastProgress().then(setProgress);
  }, []);
  if (!progress) return null;
  return (
    <div
      className="bg-blue-800/70 hover:bg-blue-800 cursor-pointer text-white px-4 py-2 rounded mb-4"
      onClick={() => navigate(`/reader/${progress.chapterId}?page=${progress.page + 1}`)}
    >
      Continue reading: {progress.title ?? progress.mangaId} – page {progress.page + 1}
    </div>
  );
};

export { default } from "../components/App"; 