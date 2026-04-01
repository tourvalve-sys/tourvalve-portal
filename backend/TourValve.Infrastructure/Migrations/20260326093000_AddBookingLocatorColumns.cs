using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TourValve.Infrastructure.Migrations
{
    public partial class AddBookingLocatorColumns : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AirlineLocator",
                table: "Bookings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ClientRequestId",
                table: "Bookings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ProviderLocator",
                table: "Bookings",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "UniversalRecordLocator",
                table: "Bookings",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AirlineLocator",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "ClientRequestId",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "ProviderLocator",
                table: "Bookings");

            migrationBuilder.DropColumn(
                name: "UniversalRecordLocator",
                table: "Bookings");
        }
    }
}
