import React from "react";
import {
  BookOpenIcon,
  EyeIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import {
  BookOpenIcon as BookOpenIconSolid,
  EyeIcon as EyeIconSolid,
  CheckCircleIcon as CheckCircleIconSolid,
} from "@heroicons/react/24/solid";
import { useLibraryStore } from "../store/libraryStore";
import { useReadingList } from "../store/readingListStore";

type Props = {
  manga: { id: string; title: string };
};

const ReadingStatusButtons: React.FC<Props> = ({ manga }) => {
  const sourceId = useLibraryStore((s) => s.selectedSource);
  const { getStatus, setReading, setPlan, setFinished } = useReadingList();
  if (!sourceId) return null;

  const currentStatus = getStatus(sourceId, manga.id);

  const handle = async (
    status: "reading" | "plan" | "finished",
    ev: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => {
    ev.stopPropagation();
    
    // If clicking the same status, remove it
    if (currentStatus === status) {
      await window.readingList.remove(sourceId, manga.id);
    } else {
      await window.readingList.setStatus(
        { sourceId, mangaId: manga.id, title: manga.title },
        status
      );
    }

    // refresh lists so UI updates
    const [r, p, f] = await Promise.all([
      window.readingList.listByStatus("reading"),
      window.readingList.listByStatus("plan"),
      window.readingList.listByStatus("finished"),
    ]);
    setReading(r as any);
    setPlan(p as any);
    setFinished(f as any);
  };

  const buttons = [
    {
      status: "reading" as const,
      title: "Currently Reading",
      Icon: BookOpenIcon,
      IconSolid: BookOpenIconSolid,
      activeColor: "text-blue-400",
      hoverColor: "hover:text-blue-400",
    },
    {
      status: "plan" as const,
      title: "Plan to Read",
      Icon: EyeIcon,
      IconSolid: EyeIconSolid,
      activeColor: "text-yellow-400",
      hoverColor: "hover:text-yellow-400",
    },
    {
      status: "finished" as const,
      title: "Finished",
      Icon: CheckCircleIcon,
      IconSolid: CheckCircleIconSolid,
      activeColor: "text-green-400",
      hoverColor: "hover:text-green-400",
    },
  ];

  return (
    <div className="hidden group-hover:flex items-center gap-1">
      {buttons.map(({ status, title, Icon, IconSolid, activeColor, hoverColor }) => {
        const isActive = currentStatus === status;
        const IconComponent = isActive ? IconSolid : Icon;
        
        return (
          <button
            key={status}
            title={isActive ? `Remove from ${title}` : title}
            className={`p-1 rounded transition-colors ${
              isActive 
                ? activeColor 
                : `text-gray-400 ${hoverColor} hover:bg-gray-700`
            }`}
            onClick={(ev) => handle(status, ev)}
          >
            <IconComponent className="w-5 h-5" />
          </button>
        );
      })}
    </div>
  );
};

export default ReadingStatusButtons; 