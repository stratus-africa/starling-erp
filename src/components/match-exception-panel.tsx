import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function MatchExceptionPanel({ message }: { message: string }) { return <Alert variant="destructive"><AlertTitle>Three-way match exception</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>; }