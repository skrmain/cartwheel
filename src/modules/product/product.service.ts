import { ProductNotFoundError } from '../../shared/errors/app-error.js';
import { productRepository } from './product.repository.js';

export const productService = {
    listProducts() {
        return productRepository.list();
    },

    async getProduct(productId: string) {
        const product = await productRepository.findById(productId);
        if (!product) {
            throw new ProductNotFoundError(productId);
        }
        return product;
    },
};
