import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../services/api";
import { useApp } from "../../context/AppProvider";

const initialProduct = {
  title: "",
  slug: "",
  description: "",
  category: "",
  brand: "YourGuyInJapan",
  priceJPY: "",
  compareAtPriceJPY: "",
  stock: "1",
  featured: false,
  tags: "",
  trustBadges: "",
  sourceUrl: ""
};

const isValidUrl = (value = "") => {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const extensionForType = (type = "") => {
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  return "jpg";
};

export const ProductCreatePage = () => {
  const navigate = useNavigate();
  const { setNotice } = useApp();
  const [sourceUrl, setSourceUrl] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [form, setForm] = useState(initialProduct);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const trimmedUrl = sourceUrl.trim();
    let cancelled = false;

    if (!trimmedUrl) {
      setPreview(null);
      setPreviewError("");
      setPreviewLoading(false);
      return undefined;
    }

    if (!isValidUrl(trimmedUrl)) {
      setPreview(null);
      setPreviewError("");
      setPreviewLoading(false);
      return undefined;
    }

    setPreviewLoading(true);
    setPreviewError("");

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await api.get("/product/preview", {
          params: { url: trimmedUrl }
        });

        if (cancelled) return;

        setPreview(response.data);
        setForm((current) => ({
          ...current,
          title: response.data.title || "",
          slug: response.data.slug || "",
          description: response.data.description || "",
          category: response.data.category || "",
          brand: response.data.brand || current.brand,
          priceJPY: response.data.priceJPY != null ? String(response.data.priceJPY) : "",
          tags: Array.isArray(response.data.tags) ? response.data.tags.join(", ") : "",
          sourceUrl: response.data.sourceUrl || trimmedUrl
        }));
      } catch (err) {
        if (cancelled) return;
        setPreview(null);
        setPreviewError(err.response?.data?.message || "Could not load a product preview.");
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [sourceUrl]);

  const buildPayload = async () => {
    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));

    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length) {
      selectedFiles.forEach((file) => payload.append("media", file));
      return payload;
    }

    if (preview?.image) {
      try {
        const response = await fetch(preview.image);
        if (!response.ok) {
          throw new Error("Preview image could not be fetched");
        }

        const blob = await response.blob();
        const extension = extensionForType(blob.type);
        const file = new File([blob], `${form.slug || "preview-image"}.${extension}`, {
          type: blob.type || "image/jpeg"
        });
        payload.append("media", file);
        return payload;
      } catch {
        throw new Error("Preview image could not be attached automatically. Upload an image file to continue.");
      }
    }

    throw new Error("An image is required. Paste a supported link or upload an image file.");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");

    try {
      const payload = await buildPayload();
      await api.post("/products", payload);
      setNotice("Product created.");
      navigate("/admin");
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Product could not be created.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="container-shell py-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] opacity-60">Admin generator</p>
          <h1 className="section-title mt-2">Paste link to generate product</h1>
        </div>
        <Link to="/admin" className="btn-secondary">
          Back to dashboard
        </Link>
      </div>

      {error && (
        <div className="mt-6 rounded-[24px] border px-4 py-3 text-sm text-red-500" style={{ borderColor: "var(--line)" }}>
          {error}
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-6">
          <div className="glass rounded-[32px] p-6">
            <h2 className="text-2xl font-semibold">Source link</h2>
            <p className="mt-3 opacity-70">
              Paste a Mercari, Yahoo Auctions, or Rakuten link and the form will prefill
              automatically.
            </p>
            <label className="mt-6 block">
              <span className="mb-2 block text-sm opacity-70">Product URL</span>
              <input
                className="input"
                type="url"
                placeholder="https://..."
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
              />
            </label>
            {previewLoading && <p className="mt-4 text-sm opacity-70">Generating product preview...</p>}
            {!previewLoading && previewError && <p className="mt-4 text-sm text-red-500">{previewError}</p>}
          </div>

          <div className="glass rounded-[32px] p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold">Preview</h2>
              {preview?.source && (
                <span className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                  {preview.source}
                </span>
              )}
            </div>

            {!preview && !previewLoading && !previewError && (
              <p className="mt-4 opacity-70">Paste a supported product link to generate a live product draft.</p>
            )}

            {preview && (
              <div className="mt-6 space-y-4">
                <img
                  src={preview.image}
                  alt={preview.title}
                  className="h-72 w-full rounded-[28px] object-cover"
                />
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] opacity-60">{preview.source}</p>
                  <h3 className="mt-3 text-2xl font-semibold">{preview.title}</h3>
                  {preview.priceJPY != null && (
                    <p className="mt-3 text-xl font-semibold">JPY {Number(preview.priceJPY).toLocaleString()}</p>
                  )}
                  {preview.brand && <p className="mt-3 text-sm opacity-70">Brand: {preview.brand}</p>}
                  <p className="mt-4 text-sm leading-7 opacity-75">{preview.description}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <form className="glass rounded-[32px] p-6" onSubmit={submit}>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold">Product form</h2>
            <p className="text-sm opacity-60">Review and edit before saving</p>
          </div>

          <div className="mt-6 grid gap-3">
            {Object.entries(form).map(([key, value]) => (
              <label key={key}>
                <span className="mb-2 block text-sm capitalize opacity-70">{key}</span>
                {typeof value === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [key]: event.target.checked }))
                    }
                  />
                ) : key === "description" ? (
                  <textarea
                    className="input min-h-32"
                    value={value}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                ) : (
                  <input
                    className="input"
                    value={value}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                )}
              </label>
            ))}

            <label>
              <span className="mb-2 block text-sm opacity-70">Images / media</span>
              <input type="file" multiple onChange={(event) => setFiles(event.target.files)} />
              <p className="mt-2 text-xs opacity-60">
                If you do not upload a file, the generator will try to attach the preview image automatically.
              </p>
            </label>

            <button type="submit" className="btn-primary" disabled={saving || previewLoading}>
              {saving ? "Saving..." : "Create product"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};
