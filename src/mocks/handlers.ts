import { http, HttpResponse } from "msw";

const mockProducts = [
  { id: "1", name: "Vintage Camera", price: 99 },
  { id: "2", name: "Leather Jacket", price: 180 },
];

export const handlers = [
  http.get("/api/products", () => HttpResponse.json(mockProducts)),
  http.get("/api/products/:id", ({ params }) => {
    const product = mockProducts.find((p) => p.id === params.id);
    return HttpResponse.json(product ?? { error: "Not found" });
  }),
];
