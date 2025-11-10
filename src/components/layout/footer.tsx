import { Facebook, Twitter, Instagram, Youtube, Apple, Play } from "lucide-react";

export default function AppFooter() {
    return (
        <footer className="bg-gray-900 text-gray-400 py-12">
            <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <div>
                        <h3 className="text-white font-semibold mb-4">About KU-ONLINE</h3>
                        <ul className="space-y-2">
                            <li><a href="#" className="hover:text-white transition">About Us</a></li>
                            <li><a href="#" className="hover:text-white transition">Careers</a></li>
                            <li><a href="#" className="hover:text-white transition">Press & Media</a></li>
                            <li><a href="#" className="hover:text-white transition">Blog</a></li>
                        </ul>
                    </div>
                    
                    <div>
                        <h3 className="text-white font-semibold mb-4">Customer Service</h3>
                        <ul className="space-y-2">
                            <li><a href="/faq" className="hover:text-white transition">Help Center</a></li>
                            <li><a href="/faq" className="hover:text-white transition">Contact Us</a></li>
                            <li><a href="/disputes-refunds" className="hover:text-white transition">Disputes & Refund Requests</a></li>
                            <li><a href="/order-tracking" className="hover:text-white transition">Order Status & Tracking</a></li>
                            <li><a href="/delivery-handover" className="hover:text-white transition">Delivery & Handover</a></li>
                        </ul>
                    </div>
                    
                    <div>
                        <h3 className="text-white font-semibold mb-4">Payment & Security</h3>
                        <ul className="space-y-2">
                            <li><a href="/safety-fraud" className="hover:text-white transition">Secure Shopping</a></li>
                            <li><a href="/fees-payments" className="hover:text-white transition">Fees & Payments</a></li>
                            <li><a href="/privacy-policy" className="hover:text-white transition">Privacy Policy</a></li>
                            <li><a href="/terms-of-use" className="hover:text-white transition">Terms of Use</a></li>
                        </ul>
                    </div>
                    
                    <div>
                        <h3 className="text-white font-semibold mb-4">Follow Us</h3>
                        <div className="flex space-x-4 mb-6">
                            <a href="#" className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-primary transition">
                                <Facebook className="w-5 h-5" />
                            </a>
                            <a href="#" className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-primary transition">
                                <Twitter className="w-5 h-5" />
                            </a>
                            <a href="#" className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-primary transition">
                                <Instagram className="w-5 h-5" />
                            </a>
                            <a href="#" className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center hover:bg-primary transition">
                                <Youtube className="w-5 h-5" />
                            </a>
                        </div>
                        <h3 className="text-white font-semibold mb-4">Download App</h3>
                        <div className="flex flex-col space-y-2">
                            <a href="#" className="bg-gray-800 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center hover:bg-primary transition">
                                <Play className="w-5 h-5 mr-2" /> Google Play
                            </a>
                             <a href="#" className="bg-gray-800 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center hover:bg-primary transition">
                                <Apple className="w-5 h-5 mr-2" /> App Store
                            </a>
                        </div>
                    </div>
                </div>
                
                <div className="border-t border-gray-800 mt-10 pt-6 text-sm text-center">
                    <p>© {new Date().getFullYear()} KU-ONLINE. All rights reserved. </p>
                </div>
            </div>
        </footer>
    )
}
