import { productRepository } from "./product.repository.js";

export const productService = {
  listProducts() {
    return productRepository.list();
  }
};
