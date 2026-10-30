"use client";

import { useRef, useState } from "react";
import { compressPhoto } from "@/lib/photo-compress";

export const MAX_PHOTOS = 4;

// Photo answers, step one (mockup screen 04): take or choose photos of the handwritten answer, shrink them on the
// phone, upload them one by one, then ask for the handwriting to be read. Photos are listed in the order taken.
export function PhotoAnswer({
  sessionId,
  questionId,
  attemptId,
  photos,
  disabled,
  capReached,
  onPhotos,
  onRead,
}: {
  sessionId: string;
  questionId: string;
  attemptId: string;
  photos: string[];
  disabled: boolean;
  capReached: boolean;
  onPhotos: (photos: string[]) => void;
  onRead: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [big, setBig] = useState<string | null>(null);
  const room = MAX_PHOTOS - photos.length;

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    let list = photos;
    const chosen = Array.from(files).slice(0, room);
    if (files.length > room) setError(`Only ${MAX_PHOTOS} photos fit on one answer. The rest were left out.`);
    try {
      for (let i = 0; i < chosen.length; i++) {
        setWorking(`Shrinking and sending photo ${i + 1} of ${chosen.length}...`);
        const blob = await compressPhoto(chosen[i]);
        const form = new FormData();
        form.append("session_id", sessionId);
        form.append("file", new File([blob], "answer.jpg", { type: "image/jpeg" }));
        const res = await fetch(`/api/cq/${questionId}/photos`, { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { file?: string; error?: string };
        if (!res.ok || !data.file) {
          setError(data.error ?? "The photo did not upload. Try again.");
          break;
        }
        list = [...list, data.file];
        onPhotos(list);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The photo could not be prepared.");
    } finally {
      setWorking(null);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
    }
  }

  async function remove(file: string) {
    setError(null);
    setWorking("Removing the photo...");
    try {
      const res = await fetch(`/api/cq/${questionId}/photos`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, file }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Could not remove the photo.");
        return;
      }
      onPhotos(photos.filter((p) => p !== file));
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setWorking(null);
    }
  }

  const busy = disabled || working !== null;

  return (
    <div className="stack-sm">
      <p className="label">Your answer, on paper</p>
      <div className="dashed stack-sm">
        <p className="small">
          Write the answer on paper, then photograph it. Use good light and keep the page flat. Up to {MAX_PHOTOS} photos, in the order you wrote them. They are shrunk on your phone first and deleted after marking.
        </p>
        <div className="row-wrap">
          <button type="button" className="btn btn-primary" disabled={busy || room <= 0} onClick={() => cameraRef.current?.click()}>
            Take a photo
          </button>
          <button type="button" className="btn" disabled={busy || room <= 0} onClick={() => galleryRef.current?.click()}>
            Choose from gallery
          </button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void add(e.target.files)} />
        <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => void add(e.target.files)} />
        {working ? <p className="small muted" role="status">{working}</p> : null}
      </div>

      {photos.length > 0 ? (
        <div className="photo-grid">
          {photos.map((file, i) => (
            <figure key={file} className="photo-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/attempts/${attemptId}/photos/${file}`}
                alt={`Answer photo ${i + 1}`}
                className={big === file ? "photo-img photo-big" : "photo-img"}
                onClick={() => setBig(big === file ? null : file)}
              />
              <figcaption className="between">
                <span className="small muted">Photo {i + 1}</span>
                <button type="button" className="btn-link small" disabled={busy} onClick={() => void remove(file)} aria-label={`Remove photo ${i + 1}`}>
                  Remove
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      {error ? <p className="form-msg" data-ok="false" role="alert">{error}</p> : null}

      <p className="small muted">
        {capReached
          ? "You have no AI gradings left today, they reset at midnight Bangladesh time."
          : "Reading the photos and marking the answer together use one AI grading."}
      </p>
      <div>
        <button type="button" className="btn btn-primary" disabled={busy || photos.length === 0 || capReached} onClick={onRead}>
          Read my handwriting
        </button>
      </div>
    </div>
  );
}
