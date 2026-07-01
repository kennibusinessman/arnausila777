"use client";

import { Coins } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { apiErrorMessage } from "@/lib/api/http";
import { useSettings, useUpdateSettings } from "@/lib/hooks/useSettings";

export default function SettingsPage() {
  const { data, isLoading, isError, error } = useSettings();
  const updateSettings = useUpdateSettings();

  const [rawPrice, setRawPrice] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Подставляем сохранённое значение, как только настройки загрузились.
  useEffect(() => {
    if (data) setRawPrice(data.raw_price_per_kg);
  }, [data]);

  function handleSave() {
    setSaveError(null);
    setSaved(false);
    updateSettings.mutate(
      { raw_price_per_kg: rawPrice || "0" },
      {
        onSuccess: () => setSaved(true),
        onError: (err) => setSaveError(apiErrorMessage(err, "Не удалось сохранить настройки")),
      }
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
        {apiErrorMessage(error, "Не удалось загрузить настройки")}
      </p>
    );
  }

  const dirty = rawPrice !== data.raw_price_per_kg;

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Card
        title="Экономика"
        action={
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Coins className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
        }
      >
        <p className="mb-4 text-[13px] text-muted">
          Себестоимость и чистая прибыль заказов считаются по правилу{" "}
          <span className="font-semibold text-text">1 кг сырья = 1 кг готовой продукции</span>:
          себестоимость = вес заказа × цена сырья, чистая прибыль = сумма заказа − себестоимость.
        </p>

        <label className="mb-1.5 block text-[13px] font-semibold text-text">
          Цена сырья ПП, ₸/кг
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="number"
            min="0"
            step="0.01"
            value={rawPrice}
            onChange={(e) => {
              setRawPrice(e.target.value);
              setSaved(false);
            }}
            className="w-40 rounded-xl border-[1.5px] border-border bg-white/80 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          <Button onClick={handleSave} disabled={updateSettings.isPending || !dirty}>
            {updateSettings.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
          {saved && !dirty && (
            <span className="text-[13px] font-semibold text-success">Сохранено ✓</span>
          )}
        </div>

        {saveError && (
          <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{saveError}</p>
        )}
      </Card>
    </div>
  );
}
