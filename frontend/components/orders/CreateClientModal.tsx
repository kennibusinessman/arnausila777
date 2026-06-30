"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useCreateClient } from "@/lib/hooks/useClients";
import { apiErrorMessage } from "@/lib/api/http";
import type { ClientRead } from "@/lib/types/client";

interface CreateClientModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (client: ClientRead) => void;
  /** Префилл из дропдауна (введённое имя). */
  defaultName?: string;
}

const inputClass =
  "w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm";

/**
 * Второе поп-ап окно: клиента с таким именем в справочнике нет — заводим его
 * «на ходу» прямо из формы заказа. Доступно менеджеру по продажам и зав. складом
 * (см. Creator в backend/app/api/routes/clients.py). Менеджер по продажам становится
 * владельцем нового клиента автоматически (manager_id проставляется на backend).
 */
export function CreateClientModal({
  open,
  onClose,
  onCreated,
  defaultName = "",
}: CreateClientModalProps) {
  const [name, setName] = useState(defaultName);
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createClient = useCreateClient();

  // Каждое открытие — со свежим префиллом из дропдауна.
  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setCompany("");
    setPhone("");
    setError(null);
  }, [open, defaultName]);

  function handleClose() {
    if (createClient.isPending) return;
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Укажите имя клиента");
      return;
    }
    setError(null);
    createClient.mutate(
      {
        name: name.trim(),
        company_name: company.trim() || null,
        phone: phone.trim() || null,
      },
      {
        onSuccess: (client) => onCreated(client),
        onError: (err) => setError(apiErrorMessage(err, "Не удалось создать клиента")),
      }
    );
  }

  return (
    <Modal open={open} title="Новый клиент" onClose={handleClose} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-[13px] font-semibold text-text">Имя клиента</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={createClient.isPending}
            autoFocus
            placeholder="Напр. Алмас Нурланов"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Компания</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              disabled={createClient.isPending}
              placeholder="ТОО «Название»"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Телефон</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={createClient.isPending}
              placeholder="+7 700 000-00-00"
              className={inputClass}
            />
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={createClient.isPending}>
            {createClient.isPending ? "Создание…" : "Создать клиента"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={createClient.isPending}
          >
            Отмена
          </Button>
        </div>
      </form>
    </Modal>
  );
}
