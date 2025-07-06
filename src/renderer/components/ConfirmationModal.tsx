import React from "react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (confirmed: boolean) => void;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  mascotImage?: string;
  variant?: "default" | "warning" | "danger";
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Yes",
  cancelText = "No",
  mascotImage,
  variant = "default"
}) => {
  if (!isOpen) return null;

  const getConfirmButtonStyle = () => {
    switch (variant) {
      case "warning":
        return "bg-yellow-600 hover:bg-yellow-700";
      case "danger":
        return "bg-red-600 hover:bg-red-700";
      default:
        return "bg-blue-600 hover:bg-blue-700";
    }
  };

  const handleConfirm = () => {
    onConfirm(true);
    onClose();
  };

  const handleCancel = () => {
    onConfirm(false);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-gray-800 rounded-lg p-6 w-80 text-center space-y-4 animate-in fade-in zoom-in-95">
        {mascotImage && (
          <img src={mascotImage} alt="Mascot" className="w-24 h-24 mx-auto" />
        )}
        <p className="text-lg font-medium">{title}</p>
        {message && (
          <p className="text-sm text-gray-400">{message}</p>
        )}
        <div className="flex justify-center gap-4 mt-4">
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 rounded transition-colors ${getConfirmButtonStyle()}`}
          >
            {confirmText}
          </button>
          <button
            onClick={handleCancel}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded transition-colors"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
