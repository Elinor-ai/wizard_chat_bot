"use client";

import { useState, useRef } from "react";

/**
 * MediaUploadPlaceholder - Visual placeholder for media recording/upload
 * @param {Object} props
 * @param {Object} props.value - { type: string, data?: string, filename?: string, duration?: number }
 * @param {function} props.onChange - Callback with updated value
 * @param {"audio"|"photo"|"video"|"file"} [props.mediaType="audio"] - Type of media
 * @param {string} [props.title] - Title text
 * @param {string} [props.prompt] - Prompt/instruction text
 * @param {string} [props.accentColor="#8b5cf6"] - Accent color
 * @param {boolean} [props.allowRecord=true] - Allow recording (for audio/video)
 * @param {boolean} [props.allowUpload=true] - Allow file upload
 */
export default function MediaUploadPlaceholder({
  value,
  onChange,
  mediaType = "audio",
  title,
  prompt,
  accentColor = "#8b5cf6",
  allowRecord = true,
  allowUpload = true
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const fileInputRef = useRef(null);
  const timerRef = useRef(null);

  const hasMedia = value?.data || value?.filename;

  const mediaConfig = {
    audio: {
      icon: "🎤",
      recordLabel: "Record Voice Note",
      uploadLabel: "Upload Audio",
      accept: "audio/*",
      placeholder: "Record a voice note or upload an audio file"
    },
    photo: {
      icon: "📷",
      recordLabel: "Take Photo",
      uploadLabel: "Upload Photo",
      accept: "image/*",
      placeholder: "Take or upload a photo"
    },
    video: {
      icon: "🎥",
      recordLabel: "Record Video",
      uploadLabel: "Upload Video",
      accept: "video/*",
      placeholder: "Record or upload a video"
    },
    file: {
      icon: "📎",
      recordLabel: null,
      uploadLabel: "Upload File",
      accept: "*/*",
      placeholder: "Upload a file"
    }
  };

  const config = mediaConfig[mediaType];

  const handleStartRecording = () => {
    // Mock recording start
    setIsRecording(true);
    setRecordingTime(0);

    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    clearInterval(timerRef.current);

    // Mock saving recording
    onChange({
      type: mediaType,
      data: "mock-recording-data",
      filename: `recording-${Date.now()}.${mediaType === "audio" ? "mp3" : "mp4"}`,
      duration: recordingTime
    });
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Mock file upload
    const reader = new FileReader();
    reader.onload = () => {
      onChange({
        type: mediaType,
        data: reader.result,
        filename: file.name,
        fileSize: file.size
      });
    };
    reader.readAsDataURL(file);
  };

  const handleClear = () => {
    onChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-slate-800 text-center">{title}</h3>
      )}

      {prompt && (
        <p className="text-slate-500 text-sm text-center">{prompt}</p>
      )}

      {/* Main media area */}
      <div
        className={`relative rounded-2xl border-2 border-dashed transition-all ${
          hasMedia
            ? "border-transparent bg-gradient-to-br"
            : "border-slate-300 hover:border-slate-400"
        }`}
        style={{
          background: hasMedia
            ? `linear-gradient(135deg, ${accentColor}15, ${accentColor}05)`
            : undefined,
          borderColor: hasMedia ? accentColor : undefined
        }}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={config.accept}
          onChange={handleFileSelect}
          className="hidden"
        />

        {hasMedia ? (
          /* Media preview */
          <div className="p-6 text-center">
            {/* Media icon with animation */}
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4"
              style={{ backgroundColor: `${accentColor}20` }}
            >
              <span className="text-4xl">{config.icon}</span>
            </div>

            {/* File info */}
            <div className="text-slate-800 font-medium mb-1">
              {value.filename}
            </div>
            <div className="text-slate-500 text-sm space-x-3">
              {value.duration && (
                <span>Duration: {formatTime(value.duration)}</span>
              )}
              {value.fileSize && (
                <span>Size: {formatFileSize(value.fileSize)}</span>
              )}
            </div>

            {/* Preview for images */}
            {mediaType === "photo" && value.data && (
              <div className="mt-4">
                <img
                  src={value.data}
                  alt="Preview"
                  className="max-h-40 mx-auto rounded-lg"
                />
              </div>
            )}

            {/* Audio visualization mock */}
            {mediaType === "audio" && (
              <div className="mt-4 flex justify-center gap-1">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-1 rounded-full animate-pulse"
                    style={{
                      backgroundColor: accentColor,
                      height: `${Math.random() * 24 + 8}px`,
                      animationDelay: `${i * 50}ms`
                    }}
                  />
                ))}
              </div>
            )}

            {/* Clear button */}
            <button
              onClick={handleClear}
              className="mt-4 px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm hover:bg-slate-200 hover:text-slate-700 transition-colors"
            >
              Remove & Try Again
            </button>
          </div>
        ) : isRecording ? (
          /* Recording state */
          <div className="p-8 text-center">
            <div
              className="inline-flex items-center justify-center w-24 h-24 rounded-full mb-4 animate-pulse"
              style={{ backgroundColor: "#ef444430" }}
            >
              <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center">
                <div className="w-4 h-4 bg-white rounded-sm" />
              </div>
            </div>

            <div className="text-slate-800 font-bold text-2xl mb-2">
              {formatTime(recordingTime)}
            </div>
            <div className="text-slate-500 text-sm mb-4">Recording...</div>

            {/* Waveform animation */}
            <div className="flex justify-center gap-1 mb-4">
              {Array.from({ length: 15 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-red-500 rounded-full animate-bounce"
                  style={{
                    height: `${Math.random() * 32 + 8}px`,
                    animationDelay: `${i * 100}ms`,
                    animationDuration: "0.5s"
                  }}
                />
              ))}
            </div>

            <button
              onClick={handleStopRecording}
              className="px-6 py-3 rounded-full bg-red-500 text-white font-medium hover:bg-red-600 transition-colors"
            >
              Stop Recording
            </button>
          </div>
        ) : (
          /* Empty state */
          <div className="p-8 text-center">
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-4"
              style={{ backgroundColor: `${accentColor}20` }}
            >
              <span className="text-4xl">{config.icon}</span>
            </div>

            <div className="text-slate-600 mb-4">{config.placeholder}</div>

            <div className="flex justify-center gap-3">
              {/* Record button */}
              {allowRecord && config.recordLabel && (
                <button
                  onClick={handleStartRecording}
                  className="px-5 py-2.5 rounded-xl font-medium text-sm text-white transition-all hover:opacity-90"
                  style={{ backgroundColor: accentColor }}
                >
                  {config.recordLabel}
                </button>
              )}

              {/* Upload button */}
              {allowUpload && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 rounded-xl font-medium text-sm border transition-all hover:bg-white/5"
                  style={{
                    borderColor: `${accentColor}50`,
                    color: accentColor
                  }}
                >
                  {config.uploadLabel}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="text-center text-xs text-slate-400">
        {mediaType === "audio" && "Tip: Keep it under 2 minutes for best results"}
        {mediaType === "photo" && "Tip: Good lighting helps"}
        {mediaType === "video" && "Tip: Landscape orientation recommended"}
        {mediaType === "file" && "Tip: Max file size 10MB"}
      </div>
    </div>
  );
}
