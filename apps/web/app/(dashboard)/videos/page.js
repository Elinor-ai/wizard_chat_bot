import { VideoLibrary } from "../../../components/video-library/video-library";

export default function VideoLibraryPage() {
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold text-neutral-900">Video library</h1>
        <p className="text-sm text-neutral-600">
          Generate, review, and publish short-form recruiting videos with captions, compliance flags, and tracking ready to go.
        </p>
      </header>
      <VideoLibrary />
    </div>
  );
}
