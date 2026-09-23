ALTER TABLE public.sales_quotes ADD COLUMN IF NOT EXISTS salesperson_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS salesperson_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS salesperson_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sales_quotes_salesperson_idx ON public.sales_quotes(salesperson_id);
CREATE INDEX IF NOT EXISTS sales_orders_salesperson_idx ON public.sales_orders(salesperson_id);
CREATE INDEX IF NOT EXISTS invoices_salesperson_idx ON public.invoices(salesperson_id);
UPDATE public.sales_quotes SET salesperson_id = created_by WHERE salesperson_id IS NULL AND created_by IN (SELECT id FROM public.profiles);
UPDATE public.sales_orders SET salesperson_id = created_by WHERE salesperson_id IS NULL AND created_by IN (SELECT id FROM public.profiles);