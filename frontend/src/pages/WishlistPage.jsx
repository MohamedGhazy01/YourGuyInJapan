import { ProductCard } from "../components/ui/ProductCard";
import { useApp } from "../context/AppProvider";

export const WishlistPage = () => {
  const { wishlist } = useApp();

  return (
    <section className="container-shell py-12">
      <h1 className="section-title">Wishlist</h1>
      <div className="mt-8">
        {wishlist.length ? (
          <div className="grid-auto">{wishlist.map((product) => <ProductCard key={product._id} product={product} />)}</div>
        ) : (
          <div className="glass rounded-[32px] p-8">Save favorites to view them here.</div>
        )}
      </div>
    </section>
  );
};

