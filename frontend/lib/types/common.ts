/** Зеркало backend/app/schemas/common.py */

export interface Message {
  detail: string;
}

export interface PageParams {
  page: number;
  size: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

/** Тело {detail: string}, которое отдают все доменные исключения (см. core/exceptions.py). */
export interface ApiErrorBody {
  detail: string;
}
