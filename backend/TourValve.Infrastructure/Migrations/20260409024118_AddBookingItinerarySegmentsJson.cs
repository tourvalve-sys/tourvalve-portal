using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TourValve.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBookingItinerarySegmentsJson : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ItinerarySegmentsJson",
                table: "Bookings",
                type: "text",
                nullable: false,
                defaultValue: "[]");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ItinerarySegmentsJson",
                table: "Bookings");
        }
    }
}
