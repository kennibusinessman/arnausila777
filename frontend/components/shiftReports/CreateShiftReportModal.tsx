"use client";

import { Modal } from "@/components/ui/Modal";
import { ShiftReportForm, type ShiftReportFormValues } from "@/components/shiftReports/ShiftReportForm";
import { useCreateShiftReport } from "@/lib/hooks/useShiftReports";
import { apiErrorMessage } from "@/lib/api/http";
import { ShiftType } from "@/lib/types/enums";
import { useState } from "react";

interface CreateShiftReportModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (reportId: string) => void;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Поп-ап создания сменного отчёта. Форма размонтируется при закрытии (Modal
 * возвращает null), поэтому каждое открытие — с чистого листа. */
export function CreateShiftReportModal({ open, onClose, onCreated }: CreateShiftReportModalProps) {
  const createReport = useCreateShiftReport();
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (createReport.isPending) return;
    setError(null);
    onClose();
  }

  function handleSubmit(values: ShiftReportFormValues) {
    setError(null);
    createReport.mutate(
      {
        shift_date: values.shift_date,
        shift_type: values.shift_type,
        comment: values.comment || null,
        downtime_hours: values.downtime_hours,
        outputs: values.outputs,
        materials: values.materials,
      },
      {
        onSuccess: (report) => {
          setError(null);
          onCreated(report.id);
        },
        onError: (err) => setError(apiErrorMessage(err, "Не удалось создать отчёт")),
      }
    );
  }

  return (
    <Modal open={open} title="Новый сменный отчёт" onClose={handleClose} size="2xl">
      <ShiftReportForm
        initial={{
          shift_date: today(),
          shift_type: ShiftType.SHIFT_1,
          comment: "",
          downtime_hours: "0",
          outputs: [],
          materials: [],
        }}
        submitLabel="Создать отчёт"
        submitting={createReport.isPending}
        error={error}
        onSubmit={handleSubmit}
        onCancel={handleClose}
      />
    </Modal>
  );
}
