"use client";

import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, FileText, Loader2 } from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const PDF_OPTIONS = {
  cMapUrl: "/cmaps/",
  cMapPacked: true,
};

interface Props {
  pdfUrl: string;
  currentPage?: number;
  onTotalPages?: (n: number) => void;
}

export default function PdfViewerWithPages({ pdfUrl, currentPage = 1, onTotalPages }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(currentPage);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (currentPage >= 1 && (numPages === 0 || currentPage <= numPages)) {
      setPage(currentPage);
    }
  }, [currentPage, numPages]);

  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-stone-400">
        <FileText className="h-12 w-12 text-stone-300" />
        <p className="text-sm">尚未指定 PDF</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-stone-400">
        <FileText className="h-10 w-10 text-stone-300" />
        <p className="text-sm text-red-500">無法載入 PDF</p>
        <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-xs text-[#C8956C] hover:underline">
          在新視窗開啟
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-stone-100">
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-stone-200 shrink-0">
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="p-1 rounded hover:bg-stone-100 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-stone-600" />
        </button>
        <span className="text-xs text-stone-500 font-mono">
          第 {page} 頁{numPages > 0 ? ` / 共 ${numPages} 頁` : ""}
        </span>
        <button
          onClick={() => setPage(p => Math.min(numPages, p + 1))}
          disabled={page >= numPages}
          className="p-1 rounded hover:bg-stone-100 disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-stone-600" />
        </button>
      </div>
      <div className="flex-1 overflow-auto flex justify-center py-4">
        <Document
          file={pdfUrl}
          options={PDF_OPTIONS}
          onLoadSuccess={({ numPages: n }) => {
            setNumPages(n);
            onTotalPages?.(n);
          }}
          onLoadError={() => setLoadError(true)}
          loading={
            <div className="flex items-center gap-2 text-stone-400 py-12">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">載入 PDF…</span>
            </div>
          }
        >
          <Page
            pageNumber={page}
            width={560}
            renderTextLayer
            renderAnnotationLayer
          />
        </Document>
      </div>
    </div>
  );
}
