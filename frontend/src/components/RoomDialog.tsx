import { useEffect, useRef, useState, type FormEvent } from "react";

export interface RoomDialogProps {
  mode: "create" | "join";
  isOpen: boolean;
  onClose: () => void;
  onSubmitCreate: (displayName: string) => Promise<void>;
  onSubmitJoin: (roomCode: string, displayName: string) => Promise<void>;
}

export function RoomDialog({
  mode,
  isOpen,
  onClose,
  onSubmitCreate,
  onSubmitJoin,
}: RoomDialogProps) {
  const [displayName, setDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setDisplayName("");
      setRoomCode("");
      setError(null);
      setIsSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, mode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedName = displayName.trim();
    if (trimmedName.length < 1 || trimmedName.length > 24) {
      setError("Enter a name between 1 and 24 characters.");
      return;
    }

    if (mode === "join") {
      const trimmedCode = roomCode.trim().toUpperCase();
      if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(trimmedCode)) {
        setError("Room code must be 6 valid letters or digits.");
        return;
      }

      setIsSubmitting(true);
      try {
        await onSubmitJoin(trimmedCode, trimmedName);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to join room.");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setIsSubmitting(true);
      try {
        await onSubmitCreate(trimmedName);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create room.");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const isCreate = mode === "create";

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        aria-labelledby="dialog-title"
        aria-modal="true"
        className="dialog-panel"
        role="dialog"
      >
        <div className="dialog-header">
          <span className="section-kicker">
            {isCreate ? "Host a table" : "Join a table"}
          </span>
          <h2 id="dialog-title">
            {isCreate ? "Create Room" : "Join Room"}
          </h2>
          <p>
            {isCreate
              ? "Choose your display name to host a private 2–6 player game."
              : "Enter the 6-character room code and your display name."}
          </p>
        </div>

        <form className="dialog-form" onSubmit={handleSubmit}>
          {!isCreate && (
            <div className="dialog-field">
              <label htmlFor="room-code-input">Room code</label>
              <input
                autoComplete="off"
                className="dialog-input uppercase"
                disabled={isSubmitting}
                id="room-code-input"
                maxLength={6}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. ABCDEF"
                ref={inputRef}
                required
                type="text"
                value={roomCode}
              />
            </div>
          )}

          <div className="dialog-field">
            <label htmlFor="display-name-input">Your name</label>
            <input
              autoComplete="name"
              className="dialog-input"
              disabled={isSubmitting}
              id="display-name-input"
              maxLength={24}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Maverick"
              ref={isCreate ? inputRef : undefined}
              required
              type="text"
              value={displayName}
            />
          </div>

          {error && (
            <div className="dialog-error" role="alert">
              {error}
            </div>
          )}

          <div className="dialog-actions">
            <button
              className="dialog-button dialog-button--cancel"
              disabled={isSubmitting}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              aria-label={isCreate ? "Confirm create room" : "Confirm join room"}
              className="dialog-button dialog-button--submit"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting
                ? isCreate
                  ? "Creating..."
                  : "Joining..."
                : isCreate
                ? "Create table"
                : "Join table"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
